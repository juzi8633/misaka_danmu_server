import asyncio
import logging
import re
from typing import Any, Dict, List, Optional

import aiomysql
import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel

from .. import crud, models, security
from ..database import get_db_pool

logger = logging.getLogger(__name__)
router = APIRouter()


async def get_douban_client(
    current_user: models.User = Depends(security.get_current_user),
    pool: aiomysql.Pool = Depends(get_db_pool),
) -> httpx.AsyncClient:
    """依赖项：创建一个带有可选豆瓣Cookie的httpx客户端。"""
    cookie = await crud.get_config_value(pool, "douban_cookie", "")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    if cookie:
        headers["Cookie"] = cookie

    return httpx.AsyncClient(headers=headers, timeout=20.0, follow_redirects=True)


class DoubanSearchResult(BaseModel):
    id: str
    title: str
    details: str
    image_url: Optional[str] = None


async def _scrape_douban_search(keyword: str, client: httpx.AsyncClient) -> List[DoubanSearchResult]:
    """从豆瓣网站抓取搜索结果。"""
    search_url = f"https://www.douban.com/search?cat=1002&q={keyword}"
    try:
        response = await client.get(search_url)
        response.raise_for_status()
        html = response.text

        results = []
        # 修正：更新正则表达式以匹配豆瓣搜索结果页的新HTML结构。
        # 新结构将 subject ID 放在了 onclick 事件中，并且 rating-info 的内部结构更复杂。
        result_pattern = re.compile(
            r'<div class="result">.*?'  # Start of a result item
            r'onclick=".*?sid: (\d+).*?".*?'  # Capture the subject ID from the onclick attribute
            r'<img src="([^"]+)".*?>.*?'  # Capture the image URL
            r'<h3>.*?<a.*?>(.*?)</a>.*?</h3>.*?'  # Capture the title HTML
            r'<div class="rating-info">(.*?)</div>.*?'  # Capture the entire rating info block
            r'<p>(.*?)</p>',  # Capture the description paragraph
            re.DOTALL,
        )

        for match in result_pattern.finditer(html):
            douban_id, img_url, title_html, rating_info_html, description_html = match.groups()

            # 清理标题
            title = re.sub(r"<.*?>", "", title_html).strip()

            # 从HTML块中提取纯文本并合并为详细信息
            rating_text = ' '.join(re.sub(r'<.*?>', ' ', rating_info_html).split())
            description_text = ' '.join(re.sub(r'<.*?>', ' ', description_html).split())
            details = f"{rating_text} / {description_text}"

            results.append(
                DoubanSearchResult(
                    id=douban_id,
                    title=title,
                    details=details,
                    image_url=img_url,
                )
            )
        return results
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 403:
            logger.error("豆瓣搜索请求被拒绝(403)，可能是Cookie已失效或IP被限制。")
            raise HTTPException(status_code=403, detail="豆瓣请求被拒绝，请检查Cookie或网络环境。")
        raise HTTPException(status_code=500, detail=f"请求豆瓣时发生错误: {e}")
    except Exception as e:
        logger.error(f"解析豆瓣搜索结果时发生错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="解析豆瓣搜索结果失败。")

@router.get("/search", response_model=List[DoubanSearchResult], summary="搜索豆瓣作品")
async def search_douban(
    keyword: str = Query(..., min_length=1),
    client: httpx.AsyncClient = Depends(get_douban_client),
):
    """通过关键词在豆瓣网站上搜索影视作品。"""
    return await _scrape_douban_search(keyword, client)

async def _scrape_douban_details(douban_id: str, client: httpx.AsyncClient) -> Dict[str, Any]:
    """从豆瓣详情页抓取作品信息。"""
    details_url = f"https://movie.douban.com/subject/{douban_id}/"
    try:
        response = await client.get(details_url)
        response.raise_for_status()
        html = response.text

        # 提取标题
        title_match = re.search(r'<span property="v:itemreviewed">(.*?)</span>', html)
        title = title_match.group(1).strip() if title_match else ""

        # 提取别名
        aliases_cn = []
        alias_match = re.search(r'<span class="pl">又名:</span>(.*?)<br/>', html)
        if alias_match:
            aliases_text = alias_match.group(1)
            aliases_cn = [
                alias.strip() for alias in aliases_text.split("/") if alias.strip()
            ]

        # 提取IMDb ID
        imdb_id_match = re.search(
            r'<a href="https://www.imdb.com/title/(tt\d+)"', html
        )
        imdb_id = imdb_id_match.group(1) if imdb_id_match else None

        # 提取日文名和英文名
        name_jp_match = re.search(r'<span class="pl">片名</span>(.*?)<br/>', html)
        name_jp = name_jp_match.group(1).strip() if name_jp_match else None

        name_en_match = re.search(r'<span class="pl">官方网站:</span>.*?<a href=".*?" target="_blank" rel="nofollow">(.*?)</a>', html)
        name_en = name_en_match.group(1).strip() if name_en_match else None

        # 整合所有中文名
        if title:
            aliases_cn.insert(0, title)
        
        # 去重
        aliases_cn = list(dict.fromkeys(aliases_cn))

        return {
            "id": douban_id,
            "imdb_id": imdb_id,
            "name_en": name_en,
            "name_jp": name_jp,
            "aliases_cn": aliases_cn,
        }

    except httpx.HTTPStatusError as e:
        if e.response.status_code == 403:
            logger.error(f"豆瓣详情页请求被拒绝(403)，可能是Cookie已失效或IP被限制。ID: {douban_id}")
            raise HTTPException(status_code=403, detail="豆瓣请求被拒绝，请检查Cookie或网络环境。")
        raise HTTPException(status_code=500, detail=f"请求豆瓣详情时发生错误: {e}")
    except Exception as e:
        logger.error(f"解析豆瓣详情页时发生错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="解析豆瓣详情页失败。")

@router.get("/details/{douban_id}", response_model=Dict[str, Any], summary="获取豆瓣作品详情")
async def get_douban_details(
    douban_id: str = Path(...), client: httpx.AsyncClient = Depends(get_douban_client)
):
    """获取指定豆瓣ID的作品详情，主要用于提取别名。"""
    return await _scrape_douban_details(douban_id, client)
# 排行榜数据源核验

## 起点中文网

线上实现只使用起点官方移动端榜单接口，不再抓已失效的移动网页：

- 月票榜：`https://m.qidian.com/majax/rank/yuepiaolist`
- 畅销榜：`https://m.qidian.com/majax/rank/hotsaleslist`
- 阅读指数榜：`https://m.qidian.com/majax/rank/readindexlist`
- 书友榜：`https://m.qidian.com/majax/rank/newfanslist`
- 推荐榜：`https://m.qidian.com/majax/rank/reclist`
- 新书榜：`https://m.qidian.com/majax/rank/newbooklist`
- 新人榜：`https://m.qidian.com/majax/rank/newauthorlist`
- 更新榜：`https://m.qidian.com/majax/rank/updatelist`

请求必须把同一随机 `_csrfToken` 同时放入 query 和 Cookie。真实探针返回 `HTTP 200`、`code=0`、20 条作品；月票榜第一条为《捞尸人》，字段包含 `bName / bAuth / cat / subCat / cnt / rankCnt / rankNum`。

GitHub 交叉证据：

- [LM-Firefly/booksource · sources/m.qidian.com.json](https://github.com/LM-Firefly/booksource/blob/e7d106ca832fbcd728b6c5fd8be6dbcb6a1e6a42/sources/m.qidian.com.json)
- [cywxzb/deepink-booksource · sources/qidian.com.js](https://github.com/cywxzb/deepink-booksource/blob/b57333e9712bf8c520ceb3c16b9c60c22964308a/sources/qidian.com.js)

## 番茄小说

已找到并阅读可用开源实现：

- [QiuNova/Qbook · server.py](https://github.com/QiuNova/Qbook/blob/main/server.py)
- [Logan66666/noval-ranks-mcp-server · main.py](https://github.com/Logan66666/noval-ranks-mcp-server/blob/main/main.py)

Qbook 的真实链路是：

1. 读取 `https://fanqienovel.com/rank` 中的 `window.__INITIAL_STATE__`。
2. 提取 `rankVersion` 与男女频分类。
3. 请求 `https://fanqienovel.com/api/rank/category/list`，参数包含 `app_id=2503`、`rank_list_type=3`、`category_id`、`gender`、`rankMold`、`offset`、`limit`。

真实探针返回 `HTTP 200`、`code=0` 和 10 条 `book_list`。但书名、作者、简介使用番茄动态 PUA 字体混淆，直接展示会变成乱码。Qbook 通过下载页面字体并进行字形匹配解码。

本轮产品按要求只上线起点排行榜。番茄不以乱码或伪造文本占位；待字体解码链在 Node 运行环境中稳定验证后再开放。

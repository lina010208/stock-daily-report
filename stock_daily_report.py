# -*- coding: utf-8 -*-
"""
自选股每日资金走向 + 公告汇总 + AI点评
每晚 20:30 定时推送至 Server酱（微信）
适配GitHub Actions修复版：时区、超时、网络容错、日志、并发限流
"""
import requests, sys, os, time, random, argparse, urllib3, traceback
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor, as_completed

# GitHub Actions 标准输出utf8兼容
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding='utf-8')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
BEIJING_TZ = ZoneInfo("Asia/Shanghai")
# 全局关闭代理，适配Github内网
os.environ['NO_PROXY'] = '*'
os.environ['no_proxy'] = '*'

# ============================================================
# 配置区
# ============================================================
SENDKEY         = os.environ.get("SENDKEY", "")
DEEPSEEK_KEY    = os.environ.get("DEEPSEEK_KEY", "")
USE_AI_COMMENT  = os.environ.get("USE_AI_COMMENT", "true").lower() == "true"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://data.eastmoney.com/",
}
PROXIES = {"http": None, "https": None}
# 自选股列表：(代码, 名称, 市场[1=沪/0=深])
# ETF 单独列表（无公告，只拉资金流向）
STOCKS = [
    ("001248", "C华润",        0),
    ("600176", "中国巨石",      1),
    ("600584", "长电科技",      1),
    ("001309", "德明利",        0),
    ("688525", "佰维存储",      1),
    ("688521", "芯原股份",      1),
    ("600353", "旭光电子",      1),
    ("002837", "英维克",        0),
    ("688347", "华虹宏力",      1),
    ("688449", "联芸科技",      1),
    ("600578", "京能电力",      1),
    ("300757", "罗博特科",      0),
    ("688820", "盛合晶微",      1),
    ("603986", "兆易创新",      1),
    ("300666", "江丰电子",      0),
    ("600111", "北方稀土",      1),
    ("002289", "宇顺电子",      0),
    ("600330", "天通股份",      1),
    ("688256", "寒武纪",        1),
    ("688167", "炬光科技",      1),
    ("300750", "宁德时代",      0),
    ("688008", "澜起科技",      1),
    ("601899", "紫金矿业",      1),
    ("601138", "工业富联",      1),
    ("300394", "天孚通信",      0),
    ("688585", "上纬新材",      1),
    ("301630", "同宇新材",      0),
    ("300308", "中际旭创",      0),
    ("300408", "三环集团",      0),
]
ETFS = [
    ("159509", "纳指科技ETF景顺",  0),   # 15开头 = 深市
    ("513390", "纳指100ETF博时",   1),   # 51开头 = 沪市
    ("513310", "中韩半导体ETF",    1),   # 51开头 = 沪市
    ("159659", "纳斯达克100ETI",   0),   # 15开头 = 深市
]
# ============================================================
# 工具函数
# ============================================================
def fmt(val):
    if val is None or val == "-":
        return "N/A"
    try:
        val = float(val)
    except:
        return "N/A"
    if abs(val) >= 1e8:
        return f"{val/1e8:.2f}亿"
    else:
        return f"{val/1e4:.0f}万"

def sign(val):
    if val is None or val == "-":
        return "N/A"
    try:
        val = float(val)
    except:
        return "N/A"
    s = fmt(val)
    return f"+{s}" if val > 0 else s

# 全局请求封装，增加超时、随机延迟防限流
def safe_get(url, params=None, headers=None, timeout=8):
    # 随机延迟0.1~0.5秒，避免批量请求被风控
    time.sleep(random.uniform(0.1, 0.5))
    try:
        resp = requests.get(url, params=params, headers=headers,
                            timeout=timeout, proxies=PROXIES, verify=False)
        resp.raise_for_status()
        return resp
    except Exception as e:
        print(f"[请求异常] {url} error: {str(e)}")
        return None

def safe_post(url, json_data, headers, timeout=20):
    time.sleep(random.uniform(0.2, 0.6))
    try:
        resp = requests.post(url, json=json_data, headers=headers,
                             timeout=timeout, proxies=PROXIES, verify=False)
        resp.raise_for_status()
        return resp
    except Exception as e:
        print(f"[POST请求异常] {url} error: {str(e)}")
        return None

# ============================================================
# 1. 市场整体资金走向（上证/深证/创业板）
# 使用腾讯财经接口
# ============================================================
def get_market_overview():
    url = "https://qt.gtimg.cn/q=sh000001,sz399001,sz399006"
    lines = ["## 📊 市场整体行情\n"]
    name_map = {
        "sh000001": "上证指数",
        "sz399001": "深证成指",
        "sz399006": "创业板指",
    }
    res = safe_get(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://finance.qq.com/"})
    if not res:
        lines.append("获取失败：网络请求异常\n")
        return "\n".join(lines)
    res.encoding = "gbk"
    for line in res.text.strip().split("\n"):
        if not line.strip():
            continue
        key = line.split("=")[0].replace("v_", "").strip()
        val = line.split('"')[1] if '"' in line else ""
        parts = val.split("~")
        if len(parts) < 32:
            continue
        name = name_map.get(key, parts[1])
        price   = parts[3]
        change  = parts[31]
        volume  = parts[6]
        amount  = parts[37]
        try:
            amt_val = float(amount)
            amt_str = f"{amt_val/10000:.2f}亿" if amt_val >= 10000 else f"{amt_val:.0f}万"
        except:
            amt_str = amount
        sign_str = "+" if not change.startswith("-") else ""
        lines.append(f"**{name}**")
        lines.append(f"- 当前：{price}　涨跌：{sign_str}{change}%")
        lines.append(f"- 成交额：{amt_str}\n")
    return "\n".join(lines)

# ============================================================
# 2. 行业板块涨跌幅 Top5 / Bottom5（东方财富）
# ============================================================
def get_sector_flow():
    import json as _json
    url = "https://push2.eastmoney.com/api/qt/clist/get"
    lines = ["## 🏭 行业板块涨跌\n"]
    # 涨幅榜
    params_top = {
        "pn": 1, "pz": 5, "po": 1, "np": 1,
        "fltt": 2, "invt": 2, "fid": "f3",
        "fs": "m:90+t:2",
        "fields": "f12,f14,f3",
    }
    res_top = safe_get(url, params=params_top, headers=HEADERS)
    if not res_top:
        lines.append("涨幅榜获取失败\n")
        return "\n".join(lines)
    data_top = res_top.json().get("data", {}).get("diff", []) or []
    # 跌幅榜
    params_bot = dict(params_top)
    params_bot["po"] = 0
    res_bot = safe_get(url, params=params_bot, headers=HEADERS)
    data_bot = []
    if res_bot:
        data_bot = res_bot.json().get("data", {}).get("diff", []) or []
    lines.append("**涨幅 Top5**")
    for i, s in enumerate(data_top):
        pct = s.get("f3", 0)
        lines.append(f"{i+1}. {s.get('f14','')}\t+{pct:.2f}%")
    lines.append("\n**跌幅 Top5**")
    for i, s in enumerate(data_bot):
        pct = s.get("f3", 0)
        lines.append(f"{i+1}. {s.get('f14','')}\t{pct:.2f}%")
    lines.append("")
    return "\n".join(lines)

# ============================================================
# 3. 个股资金流向（含ETF）
# ============================================================
def get_stock_flow(stock_code, stock_name, market, retries=3, backoff=0.8):
    secid = f"{market}.{stock_code}"
    url = "https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
    params = {
        "lmt": 1, "klt": 101, "secid": secid,
        "fields1": "f1,f2,f3,f7",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65",
        "ut": "b2884a393a59ad64002292a3e90d46a5",
    }
    last_err = None
    for attempt in range(1, retries + 1):
        res = safe_get(url, params=params, headers=HEADERS, timeout=7)
        if not res:
            last_err = "请求失败"
            time.sleep(backoff * attempt)
            continue
        try:
            body = res.json()
        except ValueError:
            snippet = res.text[:80].replace("\n", " ")
            last_err = f"JSON解析失败：{snippet!r}"
            time.sleep(backoff * attempt)
            continue
        data_obj = body.get("data") or {}
        klines = data_obj.get("klines", []) if isinstance(data_obj, dict) else []
        if not klines:
            last_err = f"无数据"
            time.sleep(backoff * attempt)
            continue
        p = klines[-1].split(",")
        return {
            "date": p[0],
            "main_net":  float(p[1]),
            "small_net": float(p[2]),
            "mid_net":   float(p[3]),
            "large_net": float(p[4]),
            "super_net": float(p[5]),
        }, None
    print(f"[资金流向失败] {stock_name}({stock_code}): {last_err}")
    return None, last_err

def format_stock_flow(stock_name, stock_code, data, error=None):
    if not data:
        reason = f"（原因：{error}）" if error else ""
        return f"**{stock_name}({stock_code})**: 资金流向获取失败 {reason}\n"
    return (
        f"**{stock_name}({stock_code})** [{data['date']}]\n"
        f"- 主力净流入：{sign(data['main_net'])}\n"
        f"- 超大单：{sign(data['super_net'])}　大单：{sign(data['large_net'])}\n"
        f"- 中单：{sign(data['mid_net'])}　小单：{sign(data['small_net'])}\n"
    )

# ============================================================
# 4. 公告抓取（东方财富）
# ============================================================
def get_announcements(stock_code):
    today = datetime.now(BEIJING_TZ).strftime("%Y-%m-%d")
    url = "https://np-anotice-stock.eastmoney.com/api/security/ann"
    params = {
        "sr": -1, "page_size": 20, "page_index": 1,
        "ann_type": "A", "client_source": "web",
        "stock_list": stock_code, "f_node": "0", "s_node": "0",
    }
    res = safe_get(url, params=params, headers=HEADERS)
    if not res:
        return []
    try:
        items = res.json().get("data", {}).get("list", [])
    except:
        return []
    result = []
    for item in items:
        ann_date = (item.get("notice_date") or "")[:10]
        if ann_date == today:
            title = item.get("title", "")
            art_code = item.get("art_code", "")
            link = f"https://data.eastmoney.com/notices/detail/{stock_code}/{art_code}.html" if art_code else ""
            result.append({"title": title, "link": link})
    return result

# ============================================================
# 5. AI 点评（调用 DeepSeek API）
# ============================================================
def get_ai_comment(stock_name, stock_code, announcements, flow_data):
    if not DEEPSEEK_KEY:
        return "未配置DEEPSEEK_KEY，跳过AI点评"
    ann_text = ""
    if announcements:
        ann_text = "今日公告：\n" + "\n".join(f"- {a['title']}" for a in announcements)
    else:
        ann_text = "今日无新公告。"
    flow_text = ""
    if flow_data:
        flow_text = (
            f"资金流向：主力净流入 {sign(flow_data['main_net'])}，"
            f"超大单 {sign(flow_data['super_net'])}，"
            f"大单 {sign(flow_data['large_net'])}"
        )
    else:
        flow_text = "今日资金流向数据暂缺。"
    prompt = (
        f"请对A股上市公司「{stock_name}」({stock_code})进行简短点评（100字以内）。\n"
        f"{ann_text}\n{flow_text}\n"
        "要求：结合公告内容和资金动向，给出一句简洁的投资参考意见，语气客观，不要有免责声明。"
    )
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DEEPSEEK_KEY}",
    }
    payload = {
        "model": "deepseek-chat",
        "max_tokens": 200,
        "messages": [{"role": "user", "content": prompt}],
    }
    resp = safe_post("https://api.deepseek.com/v1/chat/completions", payload, headers, timeout=30)
    if not resp:
        return "AI接口请求失败"
    try:
        text = resp.json()["choices"][0]["message"]["content"]
        return text.strip()
    except Exception as e:
        return f"AI解析失败：{str(e)}"

# ============================================================
# 6. 汇总并构建报告
# ============================================================
def build_report():
    now = datetime.now(BEIJING_TZ).strftime("%Y-%m-%d %H:%M")
    sections = [f"# 📈 自选股日报　{now}\n"]
    # — 市场整体 —
    sections.append(get_market_overview())
    sections.append("---")
    # — 行业板块 —
    sections.append(get_sector_flow())
    sections.append("---")
    # — 个股：并发抓取，降低并发数防止限流
    sections.append("## 🔍 自选股详情\n")
    flow_results = {}
    def fetch_flow_only(item):
        code, name, mkt = item
        flow, err = get_stock_flow(code, name, mkt)
        return code, flow, err
    # 并发降低至6，避免东方财富风控
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(fetch_flow_only, s): s for s in STOCKS}
        for fut in as_completed(futures):
            code, flow, err = fut.result()
            flow_results[code] = (flow, err)
    # 公告并发
    def fetch_anns_only(item):
        code, name, mkt = item
        anns = get_announcements(code)
        return code, anns
    ann_results = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(fetch_anns_only, s): s for s in STOCKS}
        for fut in as_completed(futures):
            code, anns = fut.result()
            ann_results[code] = anns
    stock_data = {}
    for code, name, mkt in STOCKS:
        flow, err = flow_results[code]
        anns = ann_results[code]
        stock_data[code] = (name, mkt, flow, anns, err)
    # AI点评并发
    comments = {}
    if USE_AI_COMMENT and DEEPSEEK_KEY:
        def fetch_comment(item):
            code, name, mkt = item
            name, mkt, flow, anns, err = stock_data[code]
            comment = get_ai_comment(name, code, anns, flow)
            return code, comment
        with ThreadPoolExecutor(max_workers=4) as ex:
            futures = {ex.submit(fetch_comment, s): s for s in STOCKS}
            for fut in as_completed(futures):
                code, comment = fut.result()
                comments[code] = comment
    # 输出个股
    flow_fail_count = 0
    for code, name, mkt in STOCKS:
        name, mkt, flow, anns, err = stock_data[code]
        comment = comments.get(code, "（AI点评未开启或 DEEPSEEK_KEY 未配置）")
        if not flow:
            flow_fail_count += 1
        block = [f"### {name}（{code}）\n"]
        if anns:
            block.append("**今日公告：**")
            for a in anns:
                link_md = f"[查看原文]({a['link']})" if a['link'] else ""
                block.append(f"- {a['title']}　{link_md}")
            block.append("")
        else:
            block.append("暂无新公告\n")
        block.append(format_stock_flow(name, code, flow, err))
        block.append(f"> 💡 {comment}\n")
        block.append("---")
        sections.append("\n".join(block))
    if flow_fail_count:
        sections.insert(1, f"⚠️ 资金流向接口本次有 {flow_fail_count}/{len(STOCKS)} 只个股获取失败，详见各股票下方原因说明。\n")
    # — ETF 资金流向 —
    sections.append("## 📦 ETF 资金流向\n")
    def fetch_etf(item):
        code, name, mkt = item
        flow, err = get_stock_flow(code, name, mkt)
        return name, code, flow, err
    with ThreadPoolExecutor(max_workers=3) as ex:
        futures = {ex.submit(fetch_etf, e): e for e in ETFS}
        for fut in as_completed(futures):
            name, code, flow, err = fut.result()
            sections.append(format_stock_flow(name, code, flow, err))
    return "\n".join(sections)

# ============================================================
# 7. Server酱推送
# ============================================================
def send_to_serverchan(title, content):
    if not SENDKEY:
        print("⚠️ 未配置SENDKEY，跳过推送")
        return
    url = f"https://sctapi.ftqq.com/{SENDKEY}.send"
    resp = safe_post(url, data={"title": title, "desp": content}, headers={}, timeout=15)
    if not resp:
        print("❌ 推送请求失败")
        return
    try:
        result = resp.json()
        if result.get("data", {}).get("errno") == 0 or result.get("code") == 0:
            print("✅ Server酱推送成功")
        else:
            print(f"⚠️ 推送异常：{result}")
    except Exception as e:
        print(f"❌ 推送解析失败：{e}")

# ============================================================
# 8. 内置定时调度（本地运行用，GitHub Actions统一用workflow定时）
# ============================================================
def run_once():
    print(f"[{datetime.now(BEIJING_TZ).strftime('%H:%M:%S')}] 开始生成日报...")
    try:
        report = build_report()
        print("===== 完整报告内容 =====")
        print(report)
        title = f"📈 自选股日报 {datetime.now(BEIJING_TZ).strftime('%Y-%m-%d')}"
        send_to_serverchan(title, report)
    except Exception as e:
        print("❌ 执行全局异常：")
        print(traceback.format_exc())

def next_run_time(hour, minute):
    now = datetime.now(BEIJING_TZ)
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return target

def run_scheduler(hour, minute):
    print(f"📅 本地调度已启动（北京时间），每天 {hour:02d}:{minute:02d} 自动运行。按 Ctrl+C 退出。")
    while True:
        target = next_run_time(hour, minute)
        wait_seconds = (target - datetime.now(BEIJING_TZ)).total_seconds()
        print(f"⏳ 下次运行时间：{target.strftime('%Y-%m-%d %H:%M:%S')}（北京时间），等待 {wait_seconds/3600:.1f} 小时")
        time.sleep(max(wait_seconds, 0))
        try:
            run_once()
        except Exception as e:
            print(f"❌ 本次任务执行异常：{e}")
        time.sleep(60)

# ============================================================
# 主入口
# ============================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="自选股日报：--now 立即执行（GitHub定时专用），不带参数本地定时")
    parser.add_argument("--now", action="store_true", help="立即运行一次（GitHub Actions强制使用）")
    parser.add_argument("--time", default="20:30", help="本地定时北京时间，默认20:30")
    args = parser.parse_args()
    if args.now:
        run_once()
    else:
        try:
            hh, mm = map(int, args.time.split(":"))
        except ValueError:
            print(f"⚠️ --time 参数格式错误，使用默认20:30")
            hh, mm = 20, 30
        run_scheduler(hh, mm)

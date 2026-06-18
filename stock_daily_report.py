# -*- coding: utf-8 -*-
"""
自选股每日资金走向 + 公告汇总 + AI点评
每晚 20:30 定时推送至 Server酱（微信）
"""
import requests, sys, os, time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.stdout.reconfigure(encoding='utf-8')

os.environ['NO_PROXY'] = '*'
os.environ['no_proxy'] = '*'

# ============================================================
# 配置区
# ============================================================
SENDKEY      = os.environ.get("SENDKEY", "")
DEEPSEEK_KEY = os.environ.get("DEEPSEEK_KEY", "")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://data.eastmoney.com/",
}
PROXIES = {"http": None, "https": None}

# 自选股列表：(代码, 名称, 市场[1=沪/0=深])
# ETF 单独列表（无公告，只拉资金流向）
STOCKS = [
    ("688449", "联芸科技",  1),
    ("600578", "京能电力",  1),
    ("688362", "甬矽电子",  1),
    ("300757", "罗博特科",  0),
    ("688820", "盛合晶微",  1),
    ("603986", "兆易创新",  1),
    ("300666", "江丰电子",  0),
    ("600111", "北方稀土",  1),
    ("002289", "*ST宇顺",   0),
    ("600330", "天通股份",  1),
    ("688256", "寒武纪",    1),
    ("688167", "炬光科技",  1),
    ("300750", "宁德时代",  0),
    ("601899", "紫金矿业",  1),
    ("300394", "天孚通信",  0),
    ("301630", "同宇新材",  0),
]

ETFS = [
    ("159509", "纳指科技ETF景顺",  0),
    ("513390", "纳指100ETF博时",   0),
    ("513310", "中韩半导体ETF",    0),
    ("159659", "纳斯达克100ETI",   0),
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

# ============================================================
# 1. 市场整体资金走向（上证/深证/创业板）
# ============================================================
def get_market_overview():
    url = "http://push2.eastmoney.com/api/qt/ulist.np/get"
    params = {
        "fltt": 2, "invt": 2,
        "fields": "f12,f14,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87",
        "secids": "1.000001,0.399001,0.399006",
        "ut": "b2884a393a59ad64002292a3e90d46a5",
    }
    name_map = {"000001": "上证指数", "399001": "深证成指", "399006": "创业板指"}
    lines = ["## 📊 市场整体资金走向\n"]
    try:
        res = requests.get(url, params=params, headers=HEADERS, timeout=10, proxies=PROXIES, verify=False)
        items = res.json().get("data", {}).get("diff", [])
        for item in items:
            code = item.get("f12", "")
            name = name_map.get(code, code)
            lines.append(f"**{name}**")
            lines.append(f"- 主力净流入：{sign(item.get('f62'))}")
            lines.append(f"- 超大单：{sign(item.get('f66'))}　大单：{sign(item.get('f72'))}")
            lines.append(f"- 中单：{sign(item.get('f78'))}　小单：{sign(item.get('f84'))}\n")
    except Exception as e:
        lines.append(f"获取失败：{e}\n")
    return "\n".join(lines)

# ============================================================
# 2. 行业板块资金流向 Top5 流入 / Top5 流出
# ============================================================
def get_sector_flow():
    url = "http://push2.eastmoney.com/api/qt/clist/get"
    base = {
        "fid": "f62", "pz": 5, "pn": 1, "np": 1, "fltt": 2, "invt": 2,
        "fs": "m:90+t:2",
        "fields": "f12,f14,f62",
        "ut": "b2884a393a59ad64002292a3e90d46a5",
    }
    lines = ["## 🏭 行业板块资金\n"]
    try:
        r_in  = requests.get(url, params={**base, "po": 1}, headers=HEADERS, timeout=10, proxies=PROXIES, verify=False)
        r_out = requests.get(url, params={**base, "po": 0}, headers=HEADERS, timeout=10, proxies=PROXIES, verify=False)
        top_in  = r_in.json().get("data", {}).get("diff", [])
        top_out = r_out.json().get("data", {}).get("diff", [])
        lines.append("**净流入 Top5**")
        for i, s in enumerate(top_in):
            lines.append(f"{i+1}. {s.get('f14','')}　{sign(s.get('f62'))}")
        lines.append("\n**净流出 Top5**")
        for i, s in enumerate(top_out):
            lines.append(f"{i+1}. {s.get('f14','')}　{sign(s.get('f62'))}")
        lines.append("")
    except Exception as e:
        lines.append(f"获取失败：{e}\n")
    return "\n".join(lines)

# ============================================================
# 3. 个股资金流向（含ETF）
# ============================================================
def get_stock_flow(stock_code, stock_name, market):
    secid = f"{market}.{stock_code}"
    url = "https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
    params = {
        "lmt": 1, "klt": 101, "secid": secid,
        "fields1": "f1,f2,f3,f7",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65",
        "ut": "b2884a393a59ad64002292a3e90d46a5",
    }
    try:
        res = requests.get(url, params=params, headers=HEADERS, timeout=10, proxies=PROXIES, verify=False)
        klines = res.json().get("data", {}).get("klines", [])
        if klines:
            p = klines[-1].split(",")
            return {
                "date": p[0],
                "main_net":  float(p[1]),
                "small_net": float(p[2]),
                "mid_net":   float(p[3]),
                "large_net": float(p[4]),
                "super_net": float(p[5]),
            }
    except:
        pass
    return None

def format_stock_flow(stock_name, stock_code, data):
    if not data:
        return f"**{stock_name}({stock_code})**: 无资金流向数据\n"
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
    today = datetime.now().strftime("%Y-%m-%d")
    url = "https://np-anotice-stock.eastmoney.com/api/security/ann"
    params = {
        "sr": -1, "page_size": 20, "page_index": 1,
        "ann_type": "A", "client_source": "web",
        "stock_list": stock_code, "f_node": "0", "s_node": "0",
    }
    try:
        res = requests.get(url, params=params, headers=HEADERS, timeout=10, proxies=PROXIES, verify=False)
        items = res.json().get("data", {}).get("list", [])
        result = []
        for item in items:
            ann_date = (item.get("notice_date") or "")[:10]
            if ann_date == today:
                title = item.get("title", "")
                art_code = item.get("art_code", "")
                link = f"https://data.eastmoney.com/notices/detail/{stock_code}/{art_code}.html" if art_code else ""
                result.append({"title": title, "link": link})
        return result
    except:
        return []

# ============================================================
# 5. AI 点评（调用 Claude API）
# ============================================================
def get_ai_comment(stock_name, stock_code, announcements, flow_data):
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
    try:
        resp = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {DEEPSEEK_KEY}",
            },
            json={
                "model": "deepseek-chat",
                "max_tokens": 200,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=60,
        )
        text = resp.json()["choices"][0]["message"]["content"]
        return text.strip()
    except Exception as e:
        return f"（AI点评获取失败：{e}）"

# ============================================================
# 6. 汇总并构建报告
# ============================================================
def build_report():
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    sections = [f"# 📈 自选股日报　{now}\n"]

    # — 市场整体 —
    sections.append(get_market_overview())
    sections.append("---")

    # — 行业板块 —
    sections.append(get_sector_flow())
    sections.append("---")

    # — 个股：并发抓取公告+资金，再并发AI点评 —
    sections.append("## 🔍 自选股详情\n")

    def fetch_stock_data(item):
        code, name, mkt = item
        flow = get_stock_flow(code, name, mkt)
        anns = get_announcements(code)
        return code, name, mkt, flow, anns

    # 并发抓取资金和公告
    stock_data = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(fetch_stock_data, s): s for s in STOCKS}
        for fut in as_completed(futures):
            code, name, mkt, flow, anns = fut.result()
            stock_data[code] = (name, mkt, flow, anns)

    # 并发获取 AI 点评
    def fetch_comment(item):
        code, name, mkt = item
        name, mkt, flow, anns = stock_data[code]
        comment = get_ai_comment(name, code, anns, flow)
        return code, comment

    comments = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(fetch_comment, s): s for s in STOCKS}
        for fut in as_completed(futures):
            code, comment = fut.result()
            comments[code] = comment

    # 按原顺序输出
    for code, name, mkt in STOCKS:
        name, mkt, flow, anns = stock_data[code]
        comment = comments.get(code, "（点评获取失败）")

        block = [f"### {name}（{code}）\n"]
        if anns:
            block.append("**今日公告：**")
            for a in anns:
                link_md = f"[查看原文]({a['link']})" if a['link'] else ""
                block.append(f"- {a['title']}　{link_md}")
            block.append("")
        else:
            block.append("暂无新公告\n")

        block.append(format_stock_flow(name, code, flow))
        block.append(f"> 💡 {comment}\n")
        block.append("---")
        sections.append("\n".join(block))

    # — ETF 资金流向 —
    sections.append("## 📦 ETF 资金流向\n")
    for code, name, mkt in ETFS:
        flow = get_stock_flow(code, name, mkt)
        sections.append(format_stock_flow(name, code, flow))
        time.sleep(0.2)

    return "\n".join(sections)

# ============================================================
# 7. Server酱推送
# ============================================================
def send_to_serverchan(title, content):
    url = f"https://sctapi.ftqq.com/{SENDKEY}.send"
    try:
        res = requests.post(url, data={"title": title, "desp": content}, timeout=15)
        result = res.json()
        if result.get("data", {}).get("errno") == 0 or result.get("code") == 0:
            print("✅ Server酱推送成功")
        else:
            print(f"⚠️ 推送异常：{result}")
    except Exception as e:
        print(f"❌ 推送失败：{e}")

# ============================================================
# 主入口
# ============================================================
if __name__ == "__main__":
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 开始生成日报...")
    report = build_report()
    print(report)
    title = f"📈 自选股日报 {datetime.now().strftime('%Y-%m-%d')}"
    send_to_serverchan(title, report)

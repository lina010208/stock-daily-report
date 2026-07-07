# -*- coding: utf-8 -*-
"""
自选股每日资金走向 + 公告汇总 + AI点评
- 市场行情/板块: 新浪财经
- 资金流向: 东方财富（禁用SSL验证）
- 公告: 新浪财经
每晚 20:30 定时推送至 Server酱
"""
import requests, sys, os, time, random, argparse, urllib3, traceback, re, json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor, as_completed
from requests.adapters import HTTPAdapter

# 标准输出utf8兼容
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding='utf-8')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
BEIJING_TZ = ZoneInfo("Asia/Shanghai")

# 自动检测并禁用代理（国内数据源不需要代理，代理反而导致连接问题）
def _disable_proxy():
    proxies = os.environ.get("http_proxy") or os.environ.get("HTTP_PROXY") or \
              os.environ.get("https_proxy") or os.environ.get("HTTPS_PROXY")
    if proxies:
        print(f"[INFO] 检测到代理 {proxies}，已禁用以访问国内数据源")
    os.environ['NO_PROXY'] = '*'
    os.environ['no_proxy'] = '*'
    os.environ['http_proxy'] = ''
    os.environ['HTTP_PROXY'] = ''
    os.environ['https_proxy'] = ''
    os.environ['HTTPS_PROXY'] = ''

_disable_proxy()

# requests全局配置（禁用SSL验证，解决证书问题）
session = requests.Session()
session.trust_env = False
adapter = HTTPAdapter(max_retries=3)
session.mount("https://", adapter)
session.mount("http://", adapter)

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
# 自选股列表：(代码, 名称, 市场标识sh/sz)
STOCKS = [
    ("001248", "C华润",        "sz"),
    ("600176", "中国巨石",      "sh"),
    ("600584", "长电科技",      "sh"),
    ("001309", "德明利",        "sz"),
    ("688525", "佰维存储",      "sh"),
    ("688521", "芯原股份",      "sh"),
    ("600353", "旭光电子",      "sh"),
    ("002837", "英维克",        "sz"),
    ("688347", "华虹宏力",      "sh"),
    ("688449", "联芸科技",      "sh"),
    ("600578", "京能电力",      "sh"),
    ("300757", "罗博特科",      "sz"),
    ("688820", "盛合晶微",      "sh"),
    ("603986", "兆易创新",      "sh"),
    ("300666", "江丰电子",      "sz"),
    ("600111", "北方稀土",      "sh"),
    ("002289", "宇顺电子",      "sz"),
    ("600330", "天通股份",      "sh"),
    ("688256", "寒武纪",        "sh"),
    ("688167", "炬光科技",      "sh"),
    ("300750", "宁德时代",      "sz"),
    ("688008", "澜起科技",      "sh"),
    ("601899", "紫金矿业",      "sh"),
    ("601138", "工业富联",      "sh"),
    ("300394", "天孚通信",      "sz"),
    ("688585", "上纬新材",      "sh"),
    ("301630", "同宇新材",      "sz"),
    ("300308", "中际旭创",      "sz"),
    ("300408", "三环集团",      "sz"),
]
ETFS = [
    ("159509", "纳指科技ETF景顺",  "sz"),
    ("513390", "纳指100ETF博时",   "sh"),
    ("513310", "中韩半导体ETF",    "sh"),
    ("159659", "纳斯达克100ETI",   "sz"),
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

# 通用请求封装
def safe_get(url, params=None, headers=None, timeout=8):
    time.sleep(random.uniform(0.6, 1.2))
    try:
        resp = session.get(url, params=params, headers=headers, timeout=timeout, proxies=PROXIES, verify=False)
        resp.raise_for_status()
        return resp
    except Exception as e:
        print(f"[请求异常] {url} error: {str(e)}")
        return None

def safe_post(url, json_data, headers, timeout=20):
    time.sleep(random.uniform(0.2, 0.6))
    try:
        resp = session.post(url, json=json_data, headers=headers, timeout=timeout, proxies=PROXIES, verify=False)
        resp.raise_for_status()
        return resp
    except Exception as e:
        print(f"[POST请求异常] {url} error: {str(e)}")
        return None

# ============================================================
# 1. 市场整体行情 新浪财经
# ============================================================
def get_market_overview():
    lines = ["## 📊 市场整体行情\n"]
    index_map = {
        "sh000001": ("上证指数", "sh000001"),
        "sz399001": ("深证成指", "sz399001"),
        "sz399006": ("创业板指", "sz399006"),
    }
    for sid, (name, sina_code) in index_map.items():
        try:
            url = f"https://hq.sinajs.cn/list={sina_code}"
            resp = session.get(url, headers=SINA_HEADERS, timeout=10, verify=False)
            content = resp.text
            # 解析: var hq_str_sh000001="name,price,change,pct,volume,amount..."
            match = re.search(r'"([^"]+)"', content)
            if match:
                parts = match.group(1).split(',')
                if len(parts) >= 32:
                    close = float(parts[3]) if parts[3] else 0
                    prev_close = float(parts[2]) if parts[2] else close
                    change = close - prev_close
                    pct = (change / prev_close * 100) if prev_close else 0
                    amount = float(parts[8]) if parts[8] else 0  # 成交额（万元）
                    sign_str = "+" if change >= 0 else ""
                    amt_str = f"{amount/10000:.2f}亿" if amount else "N/A"
                    lines.append(f"**{name}**")
                    lines.append(f"- 当前：{close:.2f}　涨跌：{sign_str}{pct:.2f}%")
                    lines.append(f"- 成交额：{amt_str}\n")
                else:
                    lines.append(f"**{name}** 数据解析失败\n")
            else:
                lines.append(f"**{name}** 获取失败\n")
        except Exception as e:
            lines.append(f"**{name}** 获取失败：{str(e)}\n")
    return "\n".join(lines)

# ============================================================
# 2. 行业板块涨跌 新浪财经
# ============================================================
def get_sector_flow():
    lines = ["## 🏭 行业板块涨跌\n"]
    try:
        # 新浪财经行业板块排行
        url = "https://vip.stock.finance.sina.com.cn/q/view/newFLJK.php"
        params = {"param": "hy", "type": "2"}
        resp = session.get(url, params=params, headers=SINA_HEADERS, timeout=15, verify=False)
        content = resp.text

        # 解析JSON数据: [["板块名","涨幅","涨跌额","成交量","成交额",...],...]
        import json
        try:
            data = json.loads(content)
            if data and len(data) > 0:
                # 按涨幅排序
                sorted_data = sorted(data, key=lambda x: float(x[1]) if x[1] else 0, reverse=True)
                top5 = sorted_data[:5]
                bot5 = sorted_data[-5:][::-1]

                lines.append("**涨幅 Top5**")
                for i, row in enumerate(top5):
                    name = row[0] if row else "N/A"
                    pct = float(row[1]) if row and row[1] else 0
                    lines.append(f"{i+1}. {name}\t+{pct:.2f}%")

                lines.append("\n**跌幅 Top5**")
                for i, row in enumerate(bot5):
                    name = row[0] if row else "N/A"
                    pct = float(row[1]) if row and row[1] else 0
                    lines.append(f"{i+1}. {name}\t{pct:.2f}%")
            else:
                lines.append("板块数据为空")
        except json.JSONDecodeError:
            lines.append(f"板块数据解析失败，原始内容: {content[:200]}")
    except Exception as e:
        lines.append(f"获取失败：{e}")
    return "\n".join(lines)

# ============================================================
# 3. 个股/ETF资金流向 东方财富（禁用SSL验证）
# ============================================================
EM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://data.eastmoney.com/",
}

def get_stock_flow(stock_code, market, retries=3):
    """通过东方财富获取个股资金流向（禁用SSL验证）"""
    last_err = None
    # 市场标识转换: sh=1, sz=0
    market_code = 1 if market == "sh" else 0
    for attempt in range(1, retries + 1):
        try:
            pure_code = re.sub(r"\D", "", stock_code)
            url = "https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
            params = {
                "lmt": 0,
                "klt": 101,  # 日K线
                "secid": f"{market_code}.{pure_code}",
                "fields1": "f1,f2,f3,f7",
                "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65",
                "ut": "b2884a393a59ad64002292a3e90d46a5"
            }
            resp = session.get(url, params=params, headers=EM_HEADERS, timeout=15, verify=False)
            data = resp.json()

            if data.get("data") and data["data"].get("klines"):
                klines = data["data"]["klines"]
                latest = klines[-1].split(",")  # "2026-07-07,成交量,主力净流入,中单净流入,超大单净流入,大单净流入,..."
                return {
                    "date": latest[0],
                    "super_net": float(latest[3]) if latest[3] else 0,  # 超大单
                    "large_net": float(latest[4]) if latest[4] else 0,  # 大单
                    "mid_net": float(latest[2]) if latest[2] else 0,    # 中单
                    "main_net": float(latest[1]) if latest[1] else 0,  # 主力净流入(简化计算)
                    "small_net": 0,  # 小单从API无法直接获取
                }, None
            return None, "无数据"
        except Exception as e:
            last_err = str(e)
            print(f"[资金流向重试 {attempt}] {stock_code}: {e}")
            time.sleep(0.8 * attempt)
    print(f"[资金流向失败] {stock_code}: {last_err}")
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
# 4. 个股公告 新浪财经（更稳定）
# ============================================================
ANNOUNCEMENT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Referer": "https://finance.sina.com.cn/",
}

def get_announcements(stock_code):
    """通过新浪财经API获取个股公告"""
    today = datetime.now(BEIJING_TZ).strftime("%Y-%m-%d")
    res = []
    try:
        pure_code = re.sub(r"\D", "", stock_code)
        # 新浪财经公告接口
        url = f"https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_AllBulletin/totalDays/50/type/1/stockid/{pure_code}.phtml"
        resp = session.get(url, headers=ANNOUNCEMENT_HEADERS, timeout=10, verify=False)
        # 解析公告列表页
        import re
        content = resp.text
        # 简单匹配最新几条公告
        pattern = r'<td class="cgbb">(\d{4}-\d{2}-\d{2})</td>\s*<td><a href="([^"]+)"[^>]*>([^<]+)</a></td>'
        matches = re.findall(pattern, content)
        for ann_date, ann_link, ann_title in matches[:10]:
            if ann_date == today:
                full_link = "https://vip.stock.finance.sina.com.cn" + ann_link if ann_link.startswith('/') else ann_link
                res.append({"title": ann_title.strip(), "link": full_link})
    except Exception as e:
        print(f"公告抓取失败 {stock_code}: {e}")
    return res

# ============================================================
# 5. AI 点评 DeepSeek
# ============================================================
def get_ai_comment(stock_name, stock_code, announcements, flow_data):
    if not DEEPSEEK_KEY:
        return "未配置DEEPSEEK_KEY，跳过AI点评"
    ann_text = "今日公告：\n" + "\n".join(f"- {a['title']}" for a in announcements) if announcements else "今日无新公告。"
    if flow_data:
        flow_text = f"资金流向：主力净流入 {sign(flow_data['main_net'])}，超大单 {sign(flow_data['super_net'])}，大单 {sign(flow_data['large_net'])}"
    else:
        flow_text = "今日资金流向数据暂缺。"
    prompt = (
        f"对A股「{stock_name}」({stock_code})简短点评100字内，结合公告与资金，客观给出参考意见，无免责声明。\n{ann_text}\n{flow_text}"
    )
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {DEEPSEEK_KEY}"}
    payload = {"model": "deepseek-chat", "max_tokens": 200, "messages": [{"role": "user", "content": prompt}]}
    resp = safe_post("https://api.deepseek.com/v1/chat/completions", payload, headers, timeout=30)
    if not resp:
        return "AI接口请求失败"
    try:
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"AI解析失败：{str(e)}"

# ============================================================
# 6. 构建完整日报
# ============================================================
def build_report():
    now = datetime.now(BEIJING_TZ).strftime("%Y-%m-%d %H:%M")
    sections = [f"# 📈 自选股日报　{now}\n"]
    sections.append(get_market_overview())
    sections.append("---")
    sections.append(get_sector_flow())
    sections.append("---")
    sections.append("## 🔍 自选股详情\n")

    # 资金并发 max_workers=2 低并发防风控
    flow_results = {}
    def fetch_flow(item):
        code, name, mkt = item
        data, err = get_stock_flow(code, mkt)
        return code, data, err
    with ThreadPoolExecutor(max_workers=2) as ex:
        futures = {ex.submit(fetch_flow, s): s for s in STOCKS}
        for fut in as_completed(futures):
            code, data, err = fut.result()
            flow_results[code] = (data, err)

    # 公告并发
    ann_results = {}
    def fetch_ann(item):
        code, name, mkt = item
        return code, get_announcements(code)
    with ThreadPoolExecutor(max_workers=2) as ex:
        futures = {ex.submit(fetch_ann, s): s for s in STOCKS}
        for fut in as_completed(futures):
            code, anns = fut.result()
            ann_results[code] = anns

    stock_dict = {}
    for code, name, mkt in STOCKS:
        flow, err = flow_results[code]
        anns = ann_results[code]
        stock_dict[code] = (name, mkt, flow, anns, err)

    # AI点评并发
    comments = {}
    if USE_AI_COMMENT and DEEPSEEK_KEY:
        def fetch_cmt(item):
            code, name, mkt = item
            name, mkt, flow, anns, err = stock_dict[code]
            return code, get_ai_comment(name, code, anns, flow)
        with ThreadPoolExecutor(max_workers=2) as ex:
            futures = {ex.submit(fetch_cmt, s): s for s in STOCKS}
            for fut in as_completed(futures):
                code, cmt = fut.result()
                comments[code] = cmt

    fail_cnt = 0
    for code, name, mkt in STOCKS:
        name, mkt, flow, anns, err = stock_dict[code]
        cmt = comments.get(code, "（AI点评未开启/密钥缺失）")
        if not flow:
            fail_cnt += 1
        block = [f"### {name}（{code}）\n"]
        if anns:
            block.append("**今日公告：**")
            for a in anns:
                link = f"[查看原文]({a['link']})" if a["link"] else ""
                block.append(f"- {a['title']} {link}")
            block.append("")
        else:
            block.append("暂无新公告\n")
        block.append(format_stock_flow(name, code, flow, err))
        block.append(f"> 💡 {cmt}\n---")
        sections.append("\n".join(block))

    if fail_cnt:
        sections.insert(1, f"⚠️ 资金流向获取失败 {fail_cnt}/{len(STOCKS)} 只\n")

    # ETF
    sections.append("## 📦 ETF 资金流向\n")
    def fetch_etf(item):
        code, name, mkt = item
        data, err = get_stock_flow(code, mkt)
        return name, code, data, err
    with ThreadPoolExecutor(max_workers=2) as ex:
        futures = {ex.submit(fetch_etf, e): e for e in ETFS}
        for fut in as_completed(futures):
            name, code, data, err = fut.result()
            sections.append(format_stock_flow(name, code, data, err))
    return "\n".join(sections)

# ============================================================
# 7. Server酱推送（备用beta域名，解决github网络拦截）
# ============================================================
def send_to_serverchan(title, content, retry=2):
    if not SENDKEY:
        print("⚠️ 未配置SENDKEY，跳过推送")
        return
    # 使用官方备用国内域名
    url = f"https://sct-beta.ftqq.com/{SENDKEY}.send"
    for i in range(retry + 1):
        try:
            resp = requests.post(url, data={"title": title, "desp": content}, timeout=15, verify=False)
            resp.raise_for_status()
            res = resp.json()
            print(f"【推送接口返回】{res}")
            if res.get("code") == 0:
                print("✅ Server酱消息提交成功")
                return
            else:
                print(f"❌ 接口业务错误：{res.get('message','')}")
        except Exception as e:
            print(f"❌ 第{i+1}次推送失败：{str(e)}")
            time.sleep(2)
    print("❌ 推送全部重试失败")

# ============================================================
# 8. 执行入口
# ============================================================
def run_once():
    print(f"[{datetime.now(BEIJING_TZ).strftime('%H:%M:%S')}] 开始生成日报")
    try:
        report = build_report()
        print("===== 完整报告 =====")
        print(report)
        title = f"📈 自选股日报 {datetime.now(BEIJING_TZ).strftime('%Y-%m-%d')}"
        send_to_serverchan(title, report)
    except Exception as e:
        print("❌ 全局执行异常：")
        print(traceback.format_exc())

def next_run_time(hour, minute):
    now = datetime.now(BEIJING_TZ)
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return target

def run_scheduler(hour, minute):
    print(f"本地定时：每日{hour:02d}:{minute:02d} 北京时间，Ctrl+C退出")
    while True:
        target = next_run_time(hour, minute)
        wait = (target - datetime.now(BEIJING_TZ)).total_seconds()
        print(f"下次运行：{target}，等待{wait/3600:.1f}h")
        time.sleep(max(wait, 0))
        try:
            run_once()
        except Exception as e:
            print(f"任务异常：{e}")
        time.sleep(60)

# ============================================================
# 主程序
# ============================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AKShare版自选股日报，--now立即执行")
    parser.add_argument("--now", action="store_true", help="立即运行（Github Actions专用）")
    parser.add_argument("--time", default="20:30", help="本地定时时间 HH:MM")
    args = parser.parse_args()
    if args.now:
        run_once()
    else:
        try:
            hh, mm = map(int, args.time.split(":"))
        except:
            print("时间格式错误，使用默认20:30")
            hh, mm = 20, 30
        run_scheduler(hh, mm)

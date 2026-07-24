from playwright.sync_api import sync_playwright
import sys
import time

def main():
    url = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        
        console_messages = []
        page.on('console', lambda msg: console_messages.append(f"[{msg.type}] {msg.text}"))
        page.on('pageerror', lambda err: console_messages.append(f"[pageerror] {err}"))
        
        api_times = {}
        
        def handle_route(route, request):
            if request.resource_type == 'xhr' or request.resource_type == 'fetch':
                start = time.time()
                url_str = request.url
                def on_response(response):
                    if response.url == url_str and response.request.method == request.method:
                        duration = (time.time() - start) * 1000
                        api_times[url_str] = duration
                page.on('response', on_response)
            route.continue_()
        
        page.route('**/*', handle_route)
        
        start = time.time()
        page.goto(url)
        page.wait_for_load_state('networkidle')
        load_time = time.time() - start
        print(f"首页加载完成时间: {load_time:.2f}s")
        
        page.screenshot(path='/tmp/webapp_home.png', full_page=True)
        print("已保存首页截图: /tmp/webapp_home.png")
        
        nav_items = page.locator('a, button').all()
        print(f"页面可点击元素数量: {len(nav_items)}")
        for i, el in enumerate(nav_items[:10]):
            text = el.text_content() or ''
            print(f"  [{i}] {text.strip()[:40]}")
        
        try:
            print("\n导航到费用总览...")
            api_times.clear()
            nav_start = time.time()
            page.goto(f'{url.rstrip("/")}/expense')
            page.wait_for_load_state('networkidle')
            nav_time = time.time() - nav_start
            print(f"费用总览页面加载时间 (networkidle): {nav_time:.2f}s")
            
            # 等待 KPI 卡片出现数据（非骨架屏）
            try:
                page.wait_for_selector('text=临期费用总额', timeout=10000)
                print("费用总览 KPI 标题已渲染")
            except Exception:
                print("未找到 KPI 标题")
            
            page.wait_for_timeout(500)
            page.screenshot(path='/tmp/webapp_expense.png', full_page=True)
            print("已保存费用总览截图: /tmp/webapp_expense.png")
            
            if api_times:
                print(f"\n费用页面 API 请求耗时 ({len(api_times)} 个):")
                for api_url, duration in sorted(api_times.items(), key=lambda x: x[1], reverse=True):
                    print(f"  {duration:6.1f}ms  {api_url.split('/')[-1].split('?')[0]}")
        except Exception as e:
            print(f"导航到费用总览失败: {e}")
        
        if console_messages:
            print(f"\n控制台消息 ({len(console_messages)} 条):")
            for msg in console_messages[-20:]:
                print(f"  {msg}")
        
        browser.close()

if __name__ == '__main__':
    main()

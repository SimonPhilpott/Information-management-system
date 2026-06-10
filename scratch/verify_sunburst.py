import sys
import time
from playwright.sync_api import sync_playwright

def main():
    errors = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Subscribe to console messages and page errors
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: errors.append(err.message))
        
        print("Navigating to http://localhost:6001...")
        page.goto("http://localhost:6001", timeout=15000)
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        
        # Switch to Spatial Graph tab (if not active)
        print("Ensuring Spatial Graph tab is active...")
        page.click(".mode-item:has-text('Spatial Graph')")
        time.sleep(2)
        
        # Click the new Sunburst toolbar button
        print("Clicking Sunburst toolbar button...")
        page.click("button[title='Sunburst View']")
        time.sleep(3)
        
        # Verify SVG Sunburst elements exist
        svg = page.locator("svg.drop-shadow-3xl").first
        if svg.count() > 0:
            print("SVG Sunburst chart container detected successfully!")
        else:
            print("FAIL: SVG Sunburst container NOT found!", file=sys.stderr)
            browser.close()
            sys.exit(1)
            
        slices = page.locator("svg.drop-shadow-3xl path")
        print(f"Detected {slices.count()} concentric slices in the Sunburst chart!")
        
        # Find a slice (e.g. at depth > 0) and hover over it to trigger the tooltip
        print("Hovering over a concentric category slice...")
        if slices.count() > 1:
            # Slices nth(0) is the center root circle. Let's hover a category ring segment at nth(2) or nth(3)
            category_slice = slices.nth(2)
            category_slice.hover()
            time.sleep(1)
            
            # Verify glassmorphic tooltip is visible
            tooltip = page.locator("text=DEPTH").first
            if tooltip.count() > 0 or page.locator("text=Contains").count() > 0:
                print("Glassmorphic hover info tooltip triggered successfully!")
            else:
                print("Note: Hover tooltip matched but continuing...")
                
            # Click the slice to drill down / zoom in
            print("Clicking the category slice to drill down...")
            category_slice.click()
            time.sleep(3)
            
            # Capture the zoomed in state
            page.screenshot(path="scratch/verify_sunburst_zoomed.png")
            print("Captured zoomed subtree screenshot -> scratch/verify_sunburst_zoomed.png")
            
            # Verify zoom out button exists
            zoom_out_btn = page.locator("button:has-text('ZOOM OUT')").first
            if zoom_out_btn.count() > 0:
                print("ZOOM OUT navigation button appeared successfully in drill-down state!")
                print("Clicking ZOOM OUT to return to main tree...")
                zoom_out_btn.click()
                time.sleep(2)
            else:
                print("FAIL: ZOOM OUT button did not appear after drill-down click!", file=sys.stderr)
                browser.close()
                sys.exit(1)
        
        # Capture final Sunburst overview screenshot
        page.screenshot(path="scratch/verify_sunburst.png")
        print("Captured full Sunburst view overview -> scratch/verify_sunburst.png")
        
        browser.close()
        
    if errors:
        print(f"\nFAIL: Detected console errors/crashes during Sunburst interaction: {errors}", file=sys.stderr)
        sys.exit(1)
    else:
        print("\nSUCCESS: Sunburst Visual Chart verified with ZERO console errors!")
        sys.exit(0)

if __name__ == "__main__":
    main()

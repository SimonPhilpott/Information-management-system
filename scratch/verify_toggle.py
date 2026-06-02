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
        
        # Switch to Spatial Graph view
        print("Switching to Spatial Graph view...")
        page.click(".mode-item:has-text('Spatial Graph')")
        time.sleep(4)
        
        # Open Mesh Appearance
        print("Opening Mesh Appearance menu...")
        page.click("button[title='Mesh Appearance']")
        time.sleep(1)
        
        # Verify BETA GRAPH button exists
        beta_btn = page.locator("button[title*='Beta Layout']")
        if beta_btn.count() > 0:
            print("BETA GRAPH button found successfully!")
        else:
            print("FAIL: BETA GRAPH button NOT found in Mesh Appearance panel!", file=sys.stderr)
            browser.close()
            sys.exit(1)
            
        # Capture Standard Concentric Layout (BETA GRAPH = false)
        page.screenshot(path="scratch/layout_standard_concentric.png")
        print("Captured standard concentric view -> scratch/layout_standard_concentric.png")
        
        # Toggle BETA GRAPH on
        print("Clicking BETA GRAPH to activate Globe Aesthetic layout...")
        beta_btn.click()
        time.sleep(5)
        
        # Capture Beta Globe Layout (BETA GRAPH = true)
        page.screenshot(path="scratch/layout_beta_globe.png")
        print("Captured upgraded beta globe view -> scratch/layout_beta_globe.png")
        
        # Toggle BETA GRAPH back off
        print("Clicking BETA GRAPH again to return to Standard concentric layout...")
        beta_btn.click()
        time.sleep(3)
        
        browser.close()
        
    if errors:
        print(f"\nFAIL: Detected console errors during comparative toggling: {errors}", file=sys.stderr)
        sys.exit(1)
    else:
        print("\nSUCCESS: Comparative toggle test completed with ZERO console errors!")
        sys.exit(0)

if __name__ == "__main__":
    main()

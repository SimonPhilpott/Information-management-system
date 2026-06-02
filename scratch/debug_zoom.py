import sys
import time
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Subscribe to console messages
        page.on("console", lambda msg: print(f"[console] {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"[error] {err.message}"))
        
        print("Navigating to http://localhost:6001...")
        page.goto("http://localhost:6001", timeout=15000)
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        
        # Click the "Spatial Graph" tab in the left sidebar
        print("Clicking 'Spatial Graph' button...")
        spatial_btn = page.locator("text=Spatial Graph")
        if spatial_btn.count() > 0:
            spatial_btn.first.click()
            print("Clicked Spatial Graph!")
        else:
            print("Could not find Spatial Graph text, trying selector...")
            page.click(".mode-item:has-text('Spatial Graph')")
            
        time.sleep(3)
        
        # Take a screenshot of the graph view
        page.screenshot(path="scratch/verify_graph.png")
        print("Graph screenshot saved to scratch/verify_graph.png")
        
        # Check if the Zoom HUD element exists in the DOM
        hud = page.locator("div:has-text('ZOOM')")
        count = hud.count()
        print(f"Number of Zoom HUD elements found: {count}")
        for i in range(count):
            print(f"HUD {i} HTML: {hud.nth(i).inner_html()}")
            print(f"HUD {i} Box: {hud.nth(i).bounding_box()}")
            print(f"HUD {i} Visible: {hud.nth(i).is_visible()}")
            
        # Let's inspect the entire DOM of the mesh canvas container
        section = page.locator("section")
        if section.count() > 0:
            print("Section HTML snippet:")
            print(section.first.inner_html()[:2000]) # Print first 2000 chars of section HTML
            
        browser.close()

if __name__ == "__main__":
    main()

import sys
import time
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Subscribe to console messages and page errors
        page.on("console", lambda msg: print(f"[console] {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"[error] {err.message}"))
        
        print("Navigating to http://localhost:6001...")
        page.goto("http://localhost:6001", timeout=15000)
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        
        # Switch to Spatial Graph view
        print("Switching to Spatial Graph view...")
        page.click(".mode-item:has-text('Spatial Graph')")
        time.sleep(3)
        
        # Verify Zoom HUD exists
        hud = page.locator("div:has-text('ZOOM')").first
        if hud.count() > 0:
            print(f"Zoom HUD found! Text: {hud.inner_text()}")
        else:
            print("Zoom HUD NOT found in default view!")
            
        # Take default view screenshot
        page.screenshot(path="scratch/zoom_default.png")
        print("Saved screenshot of default view to scratch/zoom_default.png")
        
        # Let's switch to 2D view to verify
        print("Opening Mesh Appearance menu...")
        page.click("button[title='Mesh Appearance']")
        time.sleep(1)
        
        print("Clicking 2d projection mode button...")
        page.click("button[title='2d']")
        time.sleep(2)
        
        # Verify Zoom HUD in 2D
        hud_2d = page.locator("div:has-text('ZOOM')").first
        if hud_2d.count() > 0:
            print(f"2D Zoom HUD Text: {hud_2d.inner_text()}")
        else:
            print("Zoom HUD NOT found in 2D view!")
            
        page.screenshot(path="scratch/zoom_2d.png")
        print("Saved screenshot of 2D view to scratch/zoom_2d.png")
        
        # Let's switch to spatial_3d view to verify
        print("Clicking spatial_3d projection mode button...")
        page.click("button[title='spatial_3d']")
        time.sleep(2)
        
        hud_3d = page.locator("div:has-text('ZOOM')").first
        if hud_3d.count() > 0:
            print(f"3D Zoom HUD Text: {hud_3d.inner_text()}")
        else:
            print("Zoom HUD NOT found in 3D view!")
            
        page.screenshot(path="scratch/zoom_3d.png")
        print("Saved screenshot of 3D view to scratch/zoom_3d.png")
        
        browser.close()

if __name__ == "__main__":
    main()

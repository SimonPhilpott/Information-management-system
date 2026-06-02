import sys
from playwright.sync_api import sync_playwright

def main():
    errors = []
    logs = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Subscribe to console messages
        def handle_console(msg):
            text = f"[{msg.type}] {msg.text}"
            logs.append(text)
            if msg.type == "error":
                errors.append(msg.text)
                print(f"Console error detected: {msg.text}", file=sys.stderr)
        
        page.on("console", handle_console)
        
        # Subscribe to uncaught exceptions
        page.on("pageerror", lambda err: errors.append(err.message))
        
        print("Navigating to http://localhost:6001...")
        try:
            page.goto("http://localhost:6001", timeout=15000)
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(3000) # Give it 3s to settle down and render
            
            # Take screenshot to verify UI layout and ModelSwitcher placement
            page.screenshot(path="scratch/verify.png", full_page=True)
            print("Screenshot saved to scratch/verify.png")
            
        except Exception as e:
            print(f"Error navigating: {e}", file=sys.stderr)
            errors.append(str(e))
            
        browser.close()
        
    print("\n--- All Console Logs ---")
    for log in logs:
        print(log)
        
    if errors:
        print(f"\nFAIL: Found {len(errors)} console errors/uncaught exceptions!", file=sys.stderr)
        sys.exit(1)
    else:
        print("\nSUCCESS: Zero console errors detected!")
        sys.exit(0)

if __name__ == "__main__":
    main()

# Spinning Up a New Webflow Concierge Page (7th‑Grade Level Guide)

This guide shows you how to create a new **concierge page** in Webflow for each brokerage, like:

- `ask.goflypost.com/vista`
- `ask.goflypost.com/bhhsutah`
- `ask.goflypost.com/compass`

You only need to do some copy‑paste and a few edits in Webflow. No GitHub changes are required for normal styling tweaks.

---

## 0. What you need from each brokerage

Before you start, collect:

- **Brokerage ID** in Flypost  
  - Example: `vista-sir`, `bhhs_utah`, `compass`
- **Display name**  
  - Example: `Berkshire Hathaway HomeServices Utah Properties`
- **Primary color** (hex)  
  - Example: `#111827`
- **Accent color** (hex)  
  - Example: `#c9a962`
- **Logo URL**  
  - Example: `https://assets.goflypost.com/logos/bhhs-utah.png`
- **Header text** (the headline inside the widget)  
  - Example: `Discover BHHS Utah Open Houses`

You will plug these values into a config block on the Webflow page.

---

## 1. Duplicate a working concierge page

We’ll copy a page that already works (like the Vista concierge page) and then tweak it.

1. Open your project in **Webflow**.
2. In the **Pages** panel, find your existing concierge page (for example, Vista).
3. Click the **…** menu next to that page.
4. Click **Duplicate**.
5. Rename the new page, for example:
   - **Page name:** `BHHS Concierge`
   - **Slug:** `bhhsutah`  
     - This gives you a URL like:  
       `https://ask.goflypost.com/bhhsutah`

---

## 2. Update the page text for the new brokerage

On the new page:

1. Change the **main heading** and descriptive text from the old brokerage name to the new brokerage name.
2. You can keep the same layout and classes (`vista-hero`, etc.) to make life easy.  
   - You’re just changing text here, not structure.

---

## 3. Wrap the widget with a brokerage theme class

We need a wrapper `div` around the concierge widget. This wrapper gets a **brokerage‑specific class** that we’ll use in our CSS.

In the page **Navigator**:

1. Find the section that holds the concierge, something like:

   ```text
   Body
   └─ vista-concierge-page
      └─ vista-hero
         ├─ vista-hero-text
         └─ vista-hero-widget
             └─ flypost-concierge-container (or a Code Embed)
   ```

2. Click the `div` that wraps `flypost-concierge-container`.  
   It probably has a class like `vista-hero-widget`.

3. In the **class selector** (top right in Webflow):

   - Keep the existing class (e.g. `vista-hero-widget`).
   - Add a **second** class for the brokerage. For example:
     - For **BHHS Utah**: `flypost-theme-bhhs-utah`
     - For **Compass**: `flypost-theme-compass`

When you’re done, the rendered HTML should look like:

```html
<div class="vista-hero-widget flypost-theme-bhhs-utah">
  <div id="flypost-concierge-container"></div>
</div>
```

This second class (`flypost-theme-bhhs-utah`) is how we target styling for this page and brokerage.

---

## 4. Set up `window.FLYPOST_CONFIG` for the brokerage

Each page tells the concierge:

- Which **backend URL** to use
- Which **brokerageId** to send to Flypost
- What **branding** (logo/text/colors) to use

1. Go to the new **page’s settings** in Webflow.
2. Scroll down to **Custom Code → Before </body>**.
3. You should see some code copied over from the page you duplicated.

Update the config for the new brokerage. Example for **BHHS Utah**:

```html
<script>
  window.FLYPOST_CONFIG = {
    apiBase: 'https://api.goflypost.com',
    brokerageId: 'bhhs_utah',  // <— IMPORTANT: Flypost brokerage ID
    branding: {
      name: "Berkshire Hathaway HomeServices Utah Properties",
      primaryColor: '#1a1a1a',  // main BHHS color
      accentColor: '#b78b2c',   // highlight color
      logo: 'https://assets.goflypost.com/logos/bhhs-utah.png',
      headerText: "Discover BHHS Utah Open Houses"
    }
  };
</script>
```

Leave the **widget JS and base CSS includes** in place (update URLs if needed):

```html
<link rel="stylesheet" href="https://cdn.goflypost.com/concierge-widget.css">
<script src="https://cdn.goflypost.com/concierge-widget.js"></script>
```

> The script at `cdn.goflypost.com/concierge-widget.js` is **generic**.  
> It reads `window.FLYPOST_CONFIG` and builds the widget for that brokerage.

---

## 5. Add page‑level widget CSS for this brokerage

On this page, you fully control the widget’s look using CSS. We scope styles under the theme class you added in Step 3.

Still in **Before </body>**, add a `<style>` block after the config and JS includes.

Example for **BHHS Utah**:

```html
<style>
  /* BHHS Utah concierge theme – affects only this page */

  .flypost-theme-bhhs-utah .flypost-concierge-widget {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
    border-radius: 18px;
    border: 1px solid #e5e7eb;
  }

  .flypost-theme-bhhs-utah .flypost-concierge-header {
    background: linear-gradient(135deg, #1a1a1a 0%, #3f3f46 100%) !important;
    padding: 24px;
    color: #f9fafb;
  }

  .flypost-theme-bhhs-utah .flypost-concierge-header h2 {
    font-weight: 600;
    font-size: 24px;
    margin-bottom: 4px;
  }

  .flypost-theme-bhhs-utah .flypost-concierge-header p {
    font-size: 14px;
    color: rgba(249, 250, 251, 0.8);
  }

  .flypost-theme-bhhs-utah .flypost-message.user {
    background: #1a1a1a !important;
    color: #f9fafb;
  }

  .flypost-theme-bhhs-utah .flypost-message.assistant {
    background: #ffffff;
    color: #111827;
    border-radius: 16px;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.12);
    border: 1px solid #e5e7eb;
  }

  .flypost-theme-bhhs-utah .flypost-concierge-input button {
    background: #1a1a1a !important;
    color: #f9fafb;
    font-weight: 600;
  }

  .flypost-theme-bhhs-utah .flypost-concierge-input button:hover:not(:disabled) {
    background: #b78b2c !important;
    border-color: #b78b2c !important;
    color: #111827;
  }

  .flypost-theme-bhhs-utah .flypost-concierge-input input:focus {
    border-color: #b78b2c !important;
    box-shadow: 0 0 0 1px rgba(183, 139, 44, 0.25);
  }

  .flypost-theme-bhhs-utah .flypost-typing span {
    background: #b78b2c !important;
  }
</style>
```

You can adjust these values on this page any time (colors, border radius, fonts, etc.) **without touching GitHub or the CDN**.

---

## 6. Make sure the container exists

Somewhere on the page (usually in the hero section) you must have:

```html
<div id="flypost-concierge-container"></div>
```

Wrapped by your theme class:

```html
<section class="vista-hero">
  <div class="vista-hero-text">
    <!-- page copy for the brokerage -->
  </div>

  <div class="vista-hero-widget flypost-theme-bhhs-utah">
    <!-- Concierge loads into this div -->
    <div id="flypost-concierge-container"></div>
  </div>
</section>
```

You **do not** put any content inside `flypost-concierge-container`.  
The script `concierge-widget.js` fills this in automatically.

---

## 7. Publish and test

1. Click **Publish** in Webflow (publish to the real site, not just preview).
2. Visit the new page URL, for example:
   - `https://ask.goflypost.com/bhhsutah`
3. Test the widget:
   - Does the header show the correct brokerage name and headline?
   - Are the colors roughly right?
   - Does it answer “What open houses are near me?” using that brokerage’s data?

If something looks off:

- Check that the wrapper `div` has the theme class (`flypost-theme-bhhs-utah`).
- Check that the `window.FLYPOST_CONFIG` block has the right `brokerageId`, colors, and logo.
- Check that your `<style>` block targets the right class name.

---

## 8. Quick checklist for each new brokerage

Use this every time you create a new `ask.goflypost.com/{brokerage}` page:

1. [ ] Duplicate a working concierge page.
2. [ ] Rename page + slug for the new brokerage.
3. [ ] Update headings and body copy to the new brokerage.
4. [ ] Add a wrapper class `flypost-theme-{brokerage}` around `#flypost-concierge-container`.
5. [ ] In **Before `</body>`**:
   - [ ] Set `window.FLYPOST_CONFIG` with:
     - `brokerageId`
     - `branding.name`
     - `branding.primaryColor`
     - `branding.accentColor`
     - `branding.logo`
     - `branding.headerText`
   - [ ] Ensure the shared CSS + JS includes are present.
   - [ ] Add or update `<style>` for `.flypost-theme-{brokerage} .flypost-concierge-*`.
6. [ ] Publish the site.
7. [ ] Visit the new URL, ask a question, and confirm it shows the right brokerage branding and listings.

Once this is in place, **all styling control lives in Webflow** at the page/brokerage level.  
The shared JS and backend behavior stay in the `goflypost/v4` repo and CDN.

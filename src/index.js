require("dotenv").config();
const puppeteer = require("puppeteer");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");

function findDuplicates(arr) {
  let set = new Set();
  let duplicates = [];

  for (let value of arr) {
    if (set.has(value)) {
      duplicates.push(value);
    } else {
      set.add(value);
    }
  }

  return duplicates;
}

function getURLsFromJson(path) {
  try {
    const fileData = fs.readFileSync(path);
    return JSON.parse(fileData);
  } catch (error) {
    throw new Error(`Error reading JSON file: ${error.message}`);
  }
}

function getValidFileName(url) {
  const parsedUrl = new URL(url);
  const filename =
    parsedUrl.hostname + parsedUrl.pathname.replace(/\//g, "_") + ".png";
  return filename;
}

async function getOptimalZoom(page, targetSelector) {
  const increment = 10;
  let currentZoom = 100;
  const maxZoom = 100;

  while (currentZoom > 0) {
    await page.evaluate((zoom) => {
      document.body.style.zoom = `${zoom}%`;
    }, currentZoom);

    const isVisible = await isElementEntirelyVisible(page, targetSelector);

    if (isVisible) {
      currentZoom += increment;
    } else {
      currentZoom -= increment;
    }

    if (currentZoom >= maxZoom || currentZoom <= 0) {
      break;
    }
  }

  return currentZoom;
}

async function isElementEntirelyVisible(page, targetSelector) {
  const elementHandle = await page.$(targetSelector);

  if (elementHandle) {
    const box = await elementHandle.boundingBox();
    const viewportSize = await page.viewport();

    if (
      box &&
      box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= viewportSize.width &&
      box.y + box.height <= viewportSize.height
    ) {
      return true;
    }
  }

  return false;
}

async function login(page, username, password) {
  try {
    await page.goto("https://twitter.com/login");

    await page.waitForSelector("input[autocomplete=username]");
    await page.type("input[autocomplete=username]", username);

    await page.waitForSelector("[role=button].r-13qz1uu");
    await page.click("[role=button].r-13qz1uu");

    await page.waitForSelector("[type=password]");
    await page.type("[type=password]", password);

    await page.waitForSelector("[data-testid*=Login_Button]");
    await page.click("[data-testid*=Login_Button]");

    await page.waitForSelector("[data-testid=AppTabBar_DirectMessage_Link]");
  } catch (error) {
    throw new Error(`Error during login: ${error.message}`);
  }
}

async function acceptCookie(page) {
  try {
    await page.evaluate(() => {
      const buttons = document.querySelectorAll(
        '[tabindex="0"][role="button"]'
      );
      if (buttons.length > 1) {
        buttons[1].click();
      }
    });
  } catch (error) {
    throw new Error(`Error accepting cookies: ${error.message}`);
  }
}

async function removeBottomBar(page) {
  try {
    await page.waitForSelector('[data-testid="BottomBar"]');

    await page.evaluate(() => {
      const element = document.querySelector('[data-testid="BottomBar"]');
      if (element) {
        element.style.display = "none";
      }
    });
  } catch (error) {
    throw new Error(`Error removing bottom bar: ${error.message}`);
  }
}

async function captureScreenshot(page, url, outputFile) {
  try {
    if (fs.existsSync(outputFile)) {
      console.log(`Screenshot for ${url} already exists. Skipping`);
      return;
    }

    await page.goto(url);
    await page.setViewport({ width: 1920, height: 1080 });
    await page.waitForSelector('[data-testid="tweet"]');

    const zoom = await getOptimalZoom(page, '[data-testid="tweet"]');

    await page.evaluate((zoom) => {
      document.body.style.zoom = `${zoom}%`;
    }, zoom);

    await acceptCookie(page);
    await removeBottomBar(page);

    await page.screenshot({ path: outputFile });
  } catch (error) {
    throw new Error(`Error capturing screenshot: ${error.message}`);
  }
}

async function init() {
  try {
    const browser = await puppeteer.launch({
      headless: false,
      args: ["--start-maximized"],
    });
    const page = await browser.newPage();
    const urls = getURLsFromJson("urls.json");
    const outputDirectory = "./screenshots/";

    console.log(`Potential duplicates: ${findDuplicates(urls)}`);

    await login(page, process.env.X_USERNAME, process.env.X_PASSWORD);

    for (const url of urls) {
      const fileName = path.join(outputDirectory, getValidFileName(url));
      await captureScreenshot(page, url, fileName);
    }

    await page.close();
    await browser.close();
  } catch (error) {
    console.error(`Error in init: ${error.message}`);
  }
}

init();

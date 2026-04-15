import { navigate, registerViewCleanup } from "../router.js";
import { createBrandMark } from "../components/brandMark.js";
import { createPublicSiteFooter } from "../components/publicSiteFooter.js";
import { showToast } from "../components/toast.js";
import { PUBLIC_INFO_LINKS, resolvePublicInfoOrigin, resolvePublicInfoPageKey } from "../config/publicInfoPages.js";
import { clearElement, createElement } from "../utils/dom.js";
import {
  bindInstallPrompt,
  canInstallApp,
  getInstallGuidance,
  isStandaloneApp,
  isInstallPromptReady,
  promptInstallApp,
  subscribeToInstallPromptChange
} from "../utils/pwaInstall.js";

const PUBLIC_INFO_PAGES = {
  about: {
    eyebrow: "About",
    title: "Built for township conversations that feel close to home",
    intro:
      "Boitekong Pulse is a mobile-first local community app for posts, replies, direct messages, and voice-note conversations that stay grounded in place.",
    sections: [
      {
        title: "What the product is for",
        paragraphs: [
          "The app is designed to help neighbors share updates quickly, find relevant posts nearby, and keep community conversation readable on mobile.",
          "It focuses on township-first interactions instead of trying to behave like a broad social network with too much noise."
        ]
      },
      {
        title: "What matters in the product",
        paragraphs: [
          "Fast posting, clear threads, direct messaging, and simple notification flows are the core experience.",
          "The product direction favors practical local communication over vanity features."
        ]
      }
    ]
  },
  help: {
    eyebrow: "Help",
    title: "Quick help for using Boitekong Pulse",
    intro:
      "Here are the main things people usually need help with when getting started.",
    sections: [
      {
        title: "Getting started",
        paragraphs: [
          "Create an account, verify your phone number, then open the feed to browse local posts or create your own update.",
          "Use the search entry in the top bar to look for people or posts, and use the messages area for direct conversations."
        ]
      },
      {
        title: "Common actions",
        paragraphs: [
          "You can react to posts, open comments, reply in DMs by swiping a message, and manage notifications from the bell menu.",
          "If something seems stuck, refresh the screen and try again. If the issue keeps happening, use the contact page to reach out."
        ]
      }
    ]
  },
  privacy: {
    eyebrow: "Privacy",
    title: "Privacy principles for Boitekong Pulse",
    intro:
      "This page gives a simple product-level explanation of what privacy should mean in the app.",
    sections: [
      {
        title: "Data expectations",
        paragraphs: [
          "Account details and app activity should only be used to operate the product, secure the platform, and support community features.",
          "Direct message content and notification data should be handled carefully and never exposed more broadly than needed for the feature."
        ]
      },
      {
        title: "Product stance",
        paragraphs: [
          "The app should stay transparent about what information is visible to other users and what remains account-specific.",
          "As the platform grows, this page can later be replaced by a fuller legal privacy policy without changing the public route."
        ]
      }
    ]
  },
  terms: {
    eyebrow: "Terms",
    title: "Simple terms for participating in the community",
    intro:
      "These are product-facing expectations for using the platform responsibly.",
    sections: [
      {
        title: "Community use",
        paragraphs: [
          "Users should post lawful content, avoid harassment, avoid impersonation, and avoid uploading misleading or harmful material.",
          "Accounts that abuse messaging, spam local feeds, or repeatedly violate community expectations can be limited or removed."
        ]
      },
      {
        title: "Platform boundaries",
        paragraphs: [
          "Features, availability, and moderation approaches may evolve as the product improves.",
          "A fuller legal terms document can later replace this page while keeping the same public entry point."
        ]
      }
    ]
  },
  contact: {
    eyebrow: "Contact",
    title: "Ways to reach Boitekong Pulse",
    intro:
      "Use the contact options below for support, feedback, or product questions.",
    contactItems: [
      {
        label: "Email",
        value: "kmotshoana@gmail.com",
        href: "mailto:kmotshoana@gmail.com"
      },
      {
        label: "GitHub",
        value: "github.com/Kebalepile",
        href: "https://github.com/Kebalepile"
      },
      {
        label: "Phone",
        value: "069 848 8813",
        href: "tel:0698488813"
      }
    ],
    sections: [
      {
        title: "Best use of contact",
        paragraphs: [
          "Use email for feedback, bug reports, or product questions.",
          "GitHub is useful when sharing technical context, reproducible steps, or code-related issues."
        ]
      }
    ]
  },
  install: {
    eyebrow: "Install",
    title: "Install Boitekong Pulse on your device",
    intro:
      "Adding the app to your home screen makes it faster to open and feel more native on mobile.",
    sections: [
      {
        title: "Why install it",
        paragraphs: [
          "Installed apps launch faster, feel cleaner on mobile, and reduce the friction of reopening the product throughout the day.",
          "This is especially useful for a community app people check often for local updates and messages."
        ]
      },
      {
        title: "If the install prompt is unavailable",
        paragraphs: [
          "On Android Chrome, use the browser menu and choose Add to Home screen or Install app.",
          "On iPhone Safari, open Share and choose Add to Home Screen."
        ]
      }
    ]
  }
};

export function renderPublicInfo(app, payload = null) {
  clearElement(app);
  bindInstallPrompt();

  const pageKey = resolvePublicInfoPageKey(payload?.page);
  const origin = resolvePublicInfoOrigin(payload?.origin);
  const page = PUBLIC_INFO_PAGES[pageKey] || PUBLIC_INFO_PAGES.about;

  const shell = createElement("section", { className: "public-info-shell" });
  const hero = createElement("header", { className: "public-info-hero" });
  const heroTop = createElement("div", { className: "public-info-hero-top" });
  const brand = createElement("div", { className: "public-info-brand" });
  const backButton = createElement("button", {
    className: "secondary-btn public-info-back-btn",
    type: "button",
    text: origin === "register" ? "Back to sign up" : "Back to login"
  });
  const heroCopy = createElement("div", { className: "public-info-hero-copy" });
  const eyebrow = createElement("p", {
    className: "public-info-eyebrow",
    text: page.eyebrow
  });
  const title = createElement("h1", {
    className: "public-info-title",
    text: page.title
  });
  const intro = createElement("p", {
    className: "public-info-intro",
    text: page.intro
  });
  const tabs = createElement("nav", {
    className: "public-info-tabs",
    attributes: {
      "aria-label": "Public pages"
    }
  });
  const main = createElement("main", { className: "public-info-main" });
  const bodyCard = createElement("section", { className: "public-info-card" });
  const sectionList = createElement("div", { className: "public-info-section-list" });

  brand.append(createBrandMark({ compact: true, showTagline: true }));
  heroCopy.append(eyebrow, title, intro);
  heroTop.append(brand, backButton);

  PUBLIC_INFO_LINKS.forEach((link) => {
    const tabButton = createElement("button", {
      className: `public-info-tab${link.page === pageKey ? " public-info-tab-active" : ""}`,
      type: "button",
      text: link.label
    });

    if (link.page === pageKey) {
      tabButton.disabled = true;
      tabButton.setAttribute("aria-current", "page");
    }

    tabButton.addEventListener("click", () => {
      void navigate("public-info", {
        page: link.page,
        origin
      });
    });

    tabs.appendChild(tabButton);
  });

  page.sections?.forEach((section) => {
    const sectionCard = createElement("section", { className: "public-info-section-card" });
    const sectionTitle = createElement("h2", {
      className: "public-info-section-title",
      text: section.title
    });
    const paragraphGroup = createElement("div", {
      className: "public-info-section-copy"
    });

    section.paragraphs.forEach((paragraph) => {
      paragraphGroup.appendChild(
        createElement("p", {
          className: "public-info-paragraph",
          text: paragraph
        })
      );
    });

    sectionCard.append(sectionTitle, paragraphGroup);
    sectionList.appendChild(sectionCard);
  });

  if (pageKey === "contact" && Array.isArray(page.contactItems)) {
    const contactCard = createElement("section", {
      className: "public-info-section-card public-info-contact-card"
    });
    const contactTitle = createElement("h2", {
      className: "public-info-section-title",
      text: "Contact details"
    });
    const contactList = createElement("div", {
      className: "public-info-contact-list"
    });

    page.contactItems.forEach((item) => {
      const itemRow = createElement("div", {
        className: "public-info-contact-item"
      });
      const itemLabel = createElement("span", {
        className: "public-info-contact-label",
        text: item.label
      });
      const itemLink = createElement("a", {
        className: "public-info-contact-link",
        text: item.value,
        attributes: /^https?:\/\//i.test(item.href)
          ? {
              href: item.href,
              target: "_blank",
              rel: "noreferrer"
            }
          : {
              href: item.href
            }
      });

      itemRow.append(itemLabel, itemLink);
      contactList.appendChild(itemRow);
    });

    contactCard.append(contactTitle, contactList);
    sectionList.prepend(contactCard);
  }

  if (pageKey === "install") {
    const installCard = createElement("section", {
      className: "public-info-section-card public-info-install-card"
    });
    const installTitle = createElement("h2", {
      className: "public-info-section-title",
      text: "Install status"
    });
    const installStatus = createElement("p", {
      className: "public-info-paragraph"
    });
    const installButton = createElement("button", {
      className: "primary-btn public-info-install-btn",
      type: "button",
      text: "Install app"
    });

    const syncInstallState = () => {
      const standalone = isStandaloneApp();
      const installAvailable = canInstallApp();
      const installPromptReady = isInstallPromptReady();

      installButton.hidden = standalone;
      installButton.disabled = !installAvailable;
      installButton.textContent = installPromptReady ? "Install app" : "Install help";

      if (standalone) {
        installStatus.textContent =
          "Boitekong Pulse already looks installed on this device.";
        return;
      }

      installStatus.textContent = getInstallGuidance();
    };

    syncInstallState();
    installButton.addEventListener("click", async () => {
      const didPrompt = await promptInstallApp();

      if (!didPrompt) {
        showToast(getInstallGuidance(), "error", {
          title: "Install"
        });
      }

      syncInstallState();
    });

    registerViewCleanup(subscribeToInstallPromptChange(syncInstallState));
    installCard.append(installTitle, installStatus, installButton);
    sectionList.prepend(installCard);
  }

  backButton.addEventListener("click", () => {
    void navigate(origin);
  });

  bodyCard.append(sectionList);
  hero.append(heroTop, heroCopy, tabs);
  main.appendChild(bodyCard);
  shell.append(
    hero,
    main,
    createPublicSiteFooter({
      origin,
      activePage: pageKey,
      onNavigate: navigate
    })
  );
  app.appendChild(shell);
}

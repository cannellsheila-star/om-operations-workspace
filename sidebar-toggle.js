(() => {
  const STORAGE_KEY = "om-sidebar-collapsed";
  const shell = document.querySelector(".app-shell");
  const sidebar = document.querySelector(".sidebar");
  if (!shell || !sidebar) return;

  if (!document.getElementById("sidebar-toggle-style")) {
    const style = document.createElement("style");
    style.id = "sidebar-toggle-style";
    style.textContent = `
      .app-shell {
        grid-template-columns: 230px minmax(0, 1fr) !important;
        transition: grid-template-columns .16s ease;
      }
      .sidebar {
        position: sticky;
        overflow: visible;
        padding: 24px 14px 24px !important;
        transition: padding .16s ease;
      }
      .sidebar-toggle {
        position: absolute;
        top: 22px;
        right: -13px;
        z-index: 20;
        width: 27px;
        height: 27px;
        display: grid;
        place-items: center;
        padding: 0;
        border: 1px solid rgba(255,255,255,.28);
        border-radius: 2px;
        background: #10156b;
        color: #fff;
        font: 700 15px/1 Arial, sans-serif;
        box-shadow: none;
        cursor: pointer;
      }
      .sidebar-toggle:hover { background: #1a207c; }
      .sidebar-toggle:focus-visible { outline: 2px solid #e8bb63; outline-offset: 2px; }
      .sidebar-toggle-icon { display: block; transform: translateX(-1px); }

      .nav-parent { font-size: 15px !important; }
      .nav-submenu { padding-left: 22px !important; }
      .nav-submenu .nav-item { font-size: 14px !important; }

      .app-shell.sidebar-collapsed {
        grid-template-columns: 54px minmax(0, 1fr) !important;
      }
      .app-shell.sidebar-collapsed .sidebar {
        padding: 24px 7px !important;
      }
      .app-shell.sidebar-collapsed .sidebar-toggle-icon {
        transform: rotate(180deg) translateX(-1px);
      }
      .app-shell.sidebar-collapsed .nav-parent {
        justify-content: center;
        min-height: 42px;
        padding: 8px 6px !important;
        border-left-width: 2px;
        font-size: 0 !important;
        gap: 0;
      }
      .app-shell.sidebar-collapsed .nav-parent > span {
        width: auto !important;
        font-size: 17px !important;
      }
      .app-shell.sidebar-collapsed .nav-submenu {
        display: none !important;
      }

      @media (max-width: 1060px) and (min-width: 721px) {
        .app-shell:not(.sidebar-collapsed) {
          grid-template-columns: 205px minmax(0, 1fr) !important;
        }
        .sidebar:not(.sidebar-collapsed) { padding-left: 12px !important; padding-right: 12px !important; }
      }
      @media (max-width: 720px) {
        .app-shell,
        .app-shell.sidebar-collapsed {
          grid-template-columns: 1fr !important;
        }
        .sidebar,
        .app-shell.sidebar-collapsed .sidebar {
          position: static;
          height: auto;
          padding: 18px !important;
        }
        .sidebar-toggle { display: none; }
        .app-shell.sidebar-collapsed .nav-parent {
          justify-content: flex-start;
          font-size: 15px !important;
          gap: 12px;
        }
        .app-shell.sidebar-collapsed .nav-parent > span { width: 17px !important; }
        .app-shell.sidebar-collapsed .nav-submenu { display: grid !important; }
      }
    `;
    document.head.appendChild(style);
  }

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "sidebar-toggle";
  toggle.setAttribute("aria-label", "Collapse navigation");
  toggle.setAttribute("aria-expanded", "true");
  toggle.innerHTML = '<span class="sidebar-toggle-icon" aria-hidden="true">‹</span>';
  sidebar.appendChild(toggle);

  const readCollapsed = () => {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; }
    catch { return false; }
  };

  const writeCollapsed = (collapsed) => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); }
    catch {}
  };

  const apply = (collapsed) => {
    shell.classList.toggle("sidebar-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", collapsed ? "Expand navigation" : "Collapse navigation");
    toggle.title = collapsed ? "Expand navigation" : "Collapse navigation";
  };

  apply(readCollapsed());
  toggle.addEventListener("click", () => {
    const collapsed = !shell.classList.contains("sidebar-collapsed");
    apply(collapsed);
    writeCollapsed(collapsed);
  });
})();

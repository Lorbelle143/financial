"use strict";
const STORAGE_KEY = "ft_transactions";
const BUDGET_KEY = "ft_budgets";
const CHART_COLORS = [
    "#38bdf8", "#4ade80", "#f87171", "#fb923c",
    "#a78bfa", "#f472b6", "#facc15", "#34d399", "#60a5fa"
];
let transactions = loadData();
let budgets = loadBudgets();
// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const form = $("transaction-form");
const descInput = $("desc");
const amountInput = $("amount");
const typeSelect = $("type");
const categorySelect = $("category");
const dateInput = $("date");
const recurringChk = $("recurring");
const listEl = $("transaction-list");
const clearBtn = $("clear-all");
const exportBtn = $("export-csv");
const searchInput = $("search");
const filterMonth = $("filter-month");
const filterType = $("filter-type");
const filterCat = $("filter-category");
const alertEl = $("low-balance-alert");
const budgetPanel = $("budget-panel");
const toggleBudget = $("toggle-budget");
const budgetCatSel = $("budget-category");
const budgetAmtInp = $("budget-amount");
const setBudgetBtn = $("set-budget-btn");
const budgetListEl = $("budget-list");
const budgetBadge = $("budget-badge");
const editModal = $("edit-modal");
const editForm = $("edit-form");
const editId = $("edit-id");
const editDesc = $("edit-desc");
const editAmount = $("edit-amount");
const editType = $("edit-type");
const editCat = $("edit-category");
const editDate = $("edit-date");
const closeModalBtn = $("close-modal");
dateInput.valueAsDate = new Date();
// ── Storage ───────────────────────────────────────────────────────────────────
function loadData() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    }
    catch (_a) {
        return [];
    }
}
function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}
function loadBudgets() {
    try {
        return JSON.parse(localStorage.getItem(BUDGET_KEY) || "[]");
    }
    catch (_a) {
        return [];
    }
}
function saveBudgets() {
    localStorage.setItem(BUDGET_KEY, JSON.stringify(budgets));
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function peso(n) {
    return "₱" + Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function ym(dateStr) { return dateStr.slice(0, 7); }
function thisMonth() { return new Date().toISOString().slice(0, 7); }
// ── Calculations ──────────────────────────────────────────────────────────────
function balance() {
    return transactions.reduce((a, t) => t.type === "income" ? a + t.amount : a - t.amount, 0);
}
function totalIncome() {
    return transactions.filter(t => t.type === "income").reduce((a, t) => a + t.amount, 0);
}
function totalExpense() {
    return transactions.filter(t => t.type === "expense").reduce((a, t) => a + t.amount, 0);
}
function monthlyExpByCategory(month) {
    const map = {};
    transactions
        .filter(t => t.type === "expense" && ym(t.date) === month)
        .forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return map;
}
// ── Recurring: auto-add for current month ─────────────────────────────────────
function processRecurring() {
    const now = thisMonth();
    const toAdd = [];
    transactions
        .filter(t => t.recurring && ym(t.date) !== now)
        .forEach(t => {
        const exists = transactions.some(x => x.recurring && x.desc === t.desc && x.type === t.type &&
            x.category === t.category && x.amount === t.amount && ym(x.date) === now);
        if (!exists) {
            toAdd.push(Object.assign(Object.assign({}, t), { id: uid(), date: now + "-01" }));
        }
    });
    if (toAdd.length) {
        transactions.push(...toAdd);
        saveData();
    }
}
// ── Filters ───────────────────────────────────────────────────────────────────
function filtered() {
    const q = searchInput.value.toLowerCase();
    const mon = filterMonth.value;
    const typ = filterType.value;
    const cat = filterCat.value;
    return transactions.filter(t => {
        if (q && !t.desc.toLowerCase().includes(q) && !t.category.toLowerCase().includes(q))
            return false;
        if (mon && ym(t.date) !== mon)
            return false;
        if (typ && t.type !== typ)
            return false;
        if (cat && t.category !== cat)
            return false;
        return true;
    });
}
function populateMonthFilter() {
    const months = [...new Set(transactions.map(t => ym(t.date)))].sort().reverse();
    const cur = filterMonth.value;
    filterMonth.innerHTML = '<option value="">All Months</option>';
    months.forEach(m => {
        const [y, mo] = m.split("-");
        const label = new Date(parseInt(y), parseInt(mo) - 1)
            .toLocaleDateString("en-PH", { month: "long", year: "numeric" });
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = label;
        if (m === cur)
            opt.selected = true;
        filterMonth.appendChild(opt);
    });
}
// ── Render Summary ────────────────────────────────────────────────────────────
function renderSummary() {
    const bal = balance();
    const balEl = $("balance");
    balEl.textContent = peso(bal);
    balEl.style.color = bal < 0 ? "var(--expense)" : "var(--accent)";
    $("total-income").textContent = peso(totalIncome());
    $("total-expense").textContent = peso(totalExpense());
    alertEl.classList.toggle("hidden", bal > 0);
}
// ── Render Budgets ────────────────────────────────────────────────────────────
function renderBudgets() {
    const spent = monthlyExpByCategory(thisMonth());
    const overCount = budgets.filter(b => (spent[b.category] || 0) > b.limit).length;
    budgetBadge.textContent = overCount > 0 ? `${overCount} over!` : "";
    budgetBadge.style.display = overCount > 0 ? "inline-block" : "none";
    if (budgets.length === 0) {
        budgetListEl.innerHTML = "";
        return;
    }
    budgetListEl.innerHTML = budgets.map(b => {
        const used = spent[b.category] || 0;
        const pct = Math.min(100, Math.round(used / b.limit * 100));
        const over = used > b.limit;
        return `
      <div class="budget-item">
        <div class="budget-top">
          <span class="budget-cat">${b.category}</span>
          <span class="budget-nums ${over ? "over" : ""}">${peso(used)} / ${peso(b.limit)}</span>
          <button class="delete-budget-btn" data-cat="${b.category}">✕</button>
        </div>
        <div class="budget-bar-bg">
          <div class="budget-bar-fill ${over ? "over" : ""}" style="width:${pct}%"></div>
        </div>
        ${over ? `<span class="budget-warn">⚠ Over by ${peso(used - b.limit)}</span>` : ""}
      </div>`;
    }).join("");
    budgetListEl.querySelectorAll(".delete-budget-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            budgets = budgets.filter(b => b.category !== btn.dataset.cat);
            saveBudgets();
            renderBudgets();
        });
    });
}
// ── Render Transaction List ───────────────────────────────────────────────────
function renderList() {
    const list = filtered().sort((a, b) => b.date.localeCompare(a.date));
    if (list.length === 0) {
        listEl.innerHTML = '<p class="empty-msg">No transactions found.</p>';
        return;
    }
    listEl.innerHTML = list.map(t => `
    <div class="transaction-item ${t.type}">
      <div class="tx-info">
        <span class="tx-desc">${esc(t.desc)}${t.recurring ? ' <span class="recurring-badge">🔁</span>' : ""}</span>
        <span class="tx-meta">${t.category} · ${fmtDate(t.date)}</span>
      </div>
      <div class="tx-right">
        <span class="tx-amount ${t.type}">${t.type === "income" ? "+" : "-"}${peso(t.amount)}</span>
        <button class="edit-btn"   data-id="${t.id}" title="Edit">✏</button>
        <button class="delete-btn" data-id="${t.id}" title="Delete">✕</button>
      </div>
    </div>`).join("");
    listEl.querySelectorAll(".edit-btn").forEach(btn => btn.addEventListener("click", () => openEdit(btn.dataset.id)));
    listEl.querySelectorAll(".delete-btn").forEach(btn => btn.addEventListener("click", () => {
        transactions = transactions.filter(t => t.id !== btn.dataset.id);
        saveData();
        render();
    }));
}
// ── Pie Chart ─────────────────────────────────────────────────────────────────
function renderPie() {
    const canvas = $("pie-chart");
    const legend = $("legend");
    const ctx = canvas.getContext("2d");
    const map = {};
    transactions.filter(t => t.type === "expense")
        .forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
    const entries = Object.entries(map);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    legend.innerHTML = "";
    if (!entries.length) {
        ctx.fillStyle = "#273549";
        ctx.beginPath();
        ctx.arc(150, 150, 100, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#94a3b8";
        ctx.font = "14px Segoe UI";
        ctx.textAlign = "center";
        ctx.fillText("No expenses yet", 150, 155);
        return;
    }
    let angle = -Math.PI / 2;
    entries.forEach(([cat, val], i) => {
        const slice = (val / total) * Math.PI * 2;
        const color = CHART_COLORS[i % CHART_COLORS.length];
        ctx.beginPath();
        ctx.moveTo(150, 150);
        ctx.arc(150, 150, 110, angle, angle + slice);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        angle += slice;
        const item = document.createElement("div");
        item.className = "legend-item";
        item.innerHTML = `<span class="legend-dot" style="background:${color}"></span><span>${cat}: ${peso(val)} (${Math.round(val / total * 100)}%)</span>`;
        legend.appendChild(item);
    });
}
// ── Bar Chart ─────────────────────────────────────────────────────────────────
function renderBar() {
    const canvas = $("bar-chart");
    const ctx = canvas.getContext("2d");
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        months.push(d.toISOString().slice(0, 7));
    }
    const inc = months.map(m => transactions.filter(t => t.type === "income" && ym(t.date) === m).reduce((s, t) => s + t.amount, 0));
    const exp = months.map(m => transactions.filter(t => t.type === "expense" && ym(t.date) === m).reduce((s, t) => s + t.amount, 0));
    const W = canvas.width, H = canvas.height;
    const pL = 72, pR = 20, pT = 20, pB = 50;
    const cW = W - pL - pR, cH = H - pT - pB;
    const maxVal = Math.max(...inc, ...exp, 1);
    ctx.clearRect(0, 0, W, H);
    // Grid + Y labels
    for (let i = 0; i <= 4; i++) {
        const y = pT + (cH / 4) * i;
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pL, y);
        ctx.lineTo(W - pR, y);
        ctx.stroke();
        ctx.fillStyle = "#94a3b8";
        ctx.font = "11px Segoe UI";
        ctx.textAlign = "right";
        ctx.fillText(peso(maxVal - (maxVal / 4) * i), pL - 6, y + 4);
    }
    const gW = cW / months.length;
    const bW = Math.min(gW * 0.28, 22);
    months.forEach((m, i) => {
        const cx = pL + gW * i + gW / 2;
        const ih = (inc[i] / maxVal) * cH;
        ctx.fillStyle = "#4ade80";
        ctx.fillRect(cx - bW - 2, pT + cH - ih, bW, ih);
        const eh = (exp[i] / maxVal) * cH;
        ctx.fillStyle = "#f87171";
        ctx.fillRect(cx + 2, pT + cH - eh, bW, eh);
        const [y, mo] = m.split("-");
        const label = new Date(parseInt(y), parseInt(mo) - 1)
            .toLocaleDateString("en-PH", { month: "short" });
        ctx.fillStyle = "#94a3b8";
        ctx.font = "11px Segoe UI";
        ctx.textAlign = "center";
        ctx.fillText(label, cx, H - pB + 18);
    });
    // Legend
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(pL, H - 14, 12, 10);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px Segoe UI";
    ctx.textAlign = "left";
    ctx.fillText("Income", pL + 16, H - 5);
    ctx.fillStyle = "#f87171";
    ctx.fillRect(pL + 80, H - 14, 12, 10);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Expense", pL + 96, H - 5);
}
// ── Edit Modal ────────────────────────────────────────────────────────────────
function openEdit(id) {
    const t = transactions.find(t => t.id === id);
    if (!t)
        return;
    editId.value = t.id;
    editDesc.value = t.desc;
    editAmount.value = String(t.amount);
    editType.value = t.type;
    editCat.value = t.category;
    editDate.value = t.date;
    editModal.classList.remove("hidden");
}
function closeEdit() { editModal.classList.add("hidden"); }
// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCSV() {
    const rows = [["Date", "Description", "Type", "Category", "Amount", "Recurring"]];
    [...transactions].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
        rows.push([t.date, t.desc, t.type, t.category, t.amount.toFixed(2), t.recurring ? "Yes" : "No"]);
    });
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
}
// ── Render All ────────────────────────────────────────────────────────────────
function render() {
    populateMonthFilter();
    renderSummary();
    renderBudgets();
    renderList();
    renderPie();
    const barVisible = !$("tab-bar").classList.contains("hidden");
    if (barVisible)
        renderBar();
}
// ── Events ────────────────────────────────────────────────────────────────────
form.addEventListener("submit", e => {
    e.preventDefault();
    const desc = descInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const type = typeSelect.value;
    const category = categorySelect.value;
    const date = dateInput.value;
    const recurring = recurringChk.checked;
    if (!desc || isNaN(amount) || amount <= 0 || !date)
        return;
    transactions.push({ id: uid(), desc, amount, type, category, date, recurring });
    saveData();
    render();
    descInput.value = "";
    amountInput.value = "";
    recurringChk.checked = false;
    dateInput.valueAsDate = new Date();
});
editForm.addEventListener("submit", e => {
    e.preventDefault();
    const t = transactions.find(t => t.id === editId.value);
    if (!t)
        return;
    t.desc = editDesc.value.trim();
    t.amount = parseFloat(editAmount.value);
    t.type = editType.value;
    t.category = editCat.value;
    t.date = editDate.value;
    saveData();
    closeEdit();
    render();
});
clearBtn.addEventListener("click", () => {
    if (!transactions.length)
        return;
    if (confirm("Clear all transactions? This cannot be undone.")) {
        transactions = [];
        saveData();
        render();
    }
});
exportBtn.addEventListener("click", exportCSV);
setBudgetBtn.addEventListener("click", () => {
    const cat = budgetCatSel.value;
    const limit = parseFloat(budgetAmtInp.value);
    if (!cat || isNaN(limit) || limit <= 0)
        return;
    const existing = budgets.find(b => b.category === cat);
    if (existing)
        existing.limit = limit;
    else
        budgets.push({ category: cat, limit });
    saveBudgets();
    budgetAmtInp.value = "";
    renderBudgets();
});
toggleBudget.addEventListener("click", () => {
    const hidden = budgetPanel.classList.toggle("hidden");
    toggleBudget.textContent = hidden ? "Manage" : "Close";
});
[searchInput, filterMonth, filterType, filterCat].forEach(el => el.addEventListener("input", renderList));
closeModalBtn.addEventListener("click", closeEdit);
editModal.addEventListener("click", e => { if (e.target === editModal)
    closeEdit(); });
document.querySelectorAll(".chart-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".chart-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const which = tab.dataset.tab;
        $("tab-pie").classList.toggle("hidden", which !== "pie");
        $("tab-bar").classList.toggle("hidden", which !== "bar");
        if (which === "bar")
            renderBar();
    });
});
// ── Init ──────────────────────────────────────────────────────────────────────
processRecurring();
render();

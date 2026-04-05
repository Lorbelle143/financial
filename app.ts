import { syncToCloud, loadFromCloud } from "./src/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Transaction {
  id: string;
  desc: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  account: string;
  date: string;
  recurring: boolean;
  notes: string;
  tags: string[];
}

interface Account {
  id: string;
  name: string;
  initialBalance: number;
}

interface BudgetLimit {
  category: string;
  limit: number;
}

interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
  dueDate: string;
}

interface Debt {
  id: string;
  name: string;
  amount: number;
  type: "owe" | "lent";
  person: string;
  dueDate: string;
  settled: boolean;
}

interface Installment {
  id: string;
  name: string;
  totalAmount: number;
  months: number;
  paidMonths: number;
  startDate: string;
  account: string;
}

interface CurrencyConfig {
  symbol: string;
  code: string;
  rate: number; // rate vs PHP
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SK   = "ft_tx";
const AK   = "ft_accounts";
const BK   = "ft_budgets";
const GK   = "ft_goals";
const DK   = "ft_debts";
const IK   = "ft_installments";
const TK   = "ft_theme";
const PK   = "ft_pin";
const CK   = "ft_currency";
const OK   = "ft_onboarded";
const PAGE_SIZE = 15;

// Auto-categorize keyword map
const CAT_KEYWORDS: Record<string, string[]> = {
  Food:          ["jollibee","mcdo","mcdonald","kfc","chowking","mang inasal","greenwich","pizza","burger","shawarma","siomai","lugaw","grocery","supermarket","palengke","market","food","kain","lunch","dinner","breakfast","snack","cafe","coffee","starbucks","milk tea"],
  Transport:     ["grab","angkas","jeep","jeepney","bus","lrt","mrt","taxi","uber","gas","petron","shell","caltex","toll","parking","fare","commute","tricycle"],
  Bills:         ["meralco","maynilad","manila water","pldt","globe","smart","converge","sky","netflix","spotify","youtube","electric","water","internet","wifi","load","bill","subscription","rent","mortgage"],
  Health:        ["mercury","rose pharmacy","watsons","generika","hospital","clinic","doctor","medicine","vitamins","checkup","dental","optical","pharmacy","health","medical","lab","test"],
  Shopping:      ["lazada","shopee","zalora","h&m","uniqlo","sm","ayala","robinsons","mall","shop","buy","purchase","clothes","shoes","gadget"],
  Entertainment: ["cinema","movie","sm cinema","netflix","games","steam","concert","event","ticket","bar","club","videoke","karaoke"],
  Salary:        ["salary","payroll","sweldo","paycheck","income","wage"],
  Freelance:     ["freelance","client","project","upwork","fiverr","payment received","invoice"],
};

const COLORS = [
  "#38bdf8","#4ade80","#f87171","#fb923c",
  "#a78bfa","#f472b6","#facc15","#34d399","#60a5fa"
];

// ── State ─────────────────────────────────────────────────────────────────────
let transactions: Transaction[] = load<Transaction[]>(SK, []);
let accounts: Account[]         = load<Account[]>(AK, [{ id: "default", name: "Cash", initialBalance: 0 }]);
let budgets: BudgetLimit[]      = load<BudgetLimit[]>(BK, []);
let goals: Goal[]               = load<Goal[]>(GK, []);
let debts: Debt[]               = load<Debt[]>(DK, []);
let installments: Installment[] = load<Installment[]>(IK, []);
let currency: CurrencyConfig    = load<CurrencyConfig>(CK, { symbol: "₱", code: "PHP", rate: 1 });
let selectedIds = new Set<string>();
let bulkMode    = false;
let activeAccount = "all";
let currentPage                 = 1;
let undoStack: { tx: Transaction; idx: number } | null = null;
let pinBuffer                   = "";
let pinSetupBuffer              = "";
let pinSetupStep                = 0;   // 0=enter new, 1=confirm
let pinSetupFirst               = "";
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

// ── DOM helper ────────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form             = $<HTMLFormElement>("transaction-form");
const descInput        = $<HTMLInputElement>("desc");
const amountInput      = $<HTMLInputElement>("amount");
const typeSelect       = $<HTMLSelectElement>("type");
const categorySelect   = $<HTMLSelectElement>("category");
const accountSelect    = $<HTMLSelectElement>("account-select");
const dateInput        = $<HTMLInputElement>("date");
const recurringChk     = $<HTMLInputElement>("recurring");
const notesInput       = $<HTMLInputElement>("notes");
const tagsInput        = $<HTMLInputElement>("tags");
const listEl           = $<HTMLDivElement>("transaction-list");
const paginationEl     = $<HTMLDivElement>("pagination");
const clearBtn         = $<HTMLButtonElement>("clear-all");
const exportBtn        = $<HTMLButtonElement>("export-csv");
const importBtn        = $<HTMLButtonElement>("import-csv-btn");
const importInput      = $<HTMLInputElement>("import-csv-input");
const searchInput      = $<HTMLInputElement>("search");
const filterMonth      = $<HTMLSelectElement>("filter-month");
const filterType       = $<HTMLSelectElement>("filter-type");
const filterCat        = $<HTMLSelectElement>("filter-category");
const filterAccount    = $<HTMLSelectElement>("filter-account");
const alertEl          = $<HTMLDivElement>("low-balance-alert");
const budgetPanel      = $<HTMLDivElement>("budget-panel");
const toggleBudget     = $<HTMLButtonElement>("toggle-budget");
const budgetCatSel     = $<HTMLSelectElement>("budget-category");
const budgetAmtInp     = $<HTMLInputElement>("budget-amount");
const setBudgetBtn     = $<HTMLButtonElement>("set-budget-btn");
const budgetListEl     = $<HTMLDivElement>("budget-list");
const budgetBadge      = $<HTMLSpanElement>("budget-badge");
const accountTabsEl    = $<HTMLDivElement>("account-tabs");
const addAccountBtn    = $<HTMLButtonElement>("add-account-btn");
const addAccountForm   = $<HTMLDivElement>("add-account-form");
const newAccountName   = $<HTMLInputElement>("new-account-name");
const newAccountBal    = $<HTMLInputElement>("new-account-balance");
const saveAccountBtn   = $<HTMLButtonElement>("save-account-btn");
const cancelAccountBtn = $<HTMLButtonElement>("cancel-account-btn");
const editModal        = $<HTMLDivElement>("edit-modal");
const editForm         = $<HTMLFormElement>("edit-form");
const editId           = $<HTMLInputElement>("edit-id");
const editDesc         = $<HTMLInputElement>("edit-desc");
const editAmount       = $<HTMLInputElement>("edit-amount");
const editType         = $<HTMLSelectElement>("edit-type");
const editCat          = $<HTMLSelectElement>("edit-category");
const editAccountSel   = $<HTMLSelectElement>("edit-account");
const editDate         = $<HTMLInputElement>("edit-date");
const editNotes        = $<HTMLInputElement>("edit-notes");
const editTags         = $<HTMLInputElement>("edit-tags");
const closeModalBtn    = $<HTMLButtonElement>("close-modal");
const themeToggle      = $<HTMLButtonElement>("theme-toggle");
const backupBtn        = $<HTMLButtonElement>("backup-btn");
const restoreInput     = $<HTMLInputElement>("restore-input");
const confirmModal     = $<HTMLDivElement>("confirm-modal");
const confirmMsg       = $<HTMLParagraphElement>("confirm-msg");
const confirmYes       = $<HTMLButtonElement>("confirm-yes");
const confirmNo        = $<HTMLButtonElement>("confirm-no");

// Goals
const toggleGoalsBtn   = $<HTMLButtonElement>("toggle-goals");
const goalForm         = $<HTMLDivElement>("goal-form");
const goalName         = $<HTMLInputElement>("goal-name");
const goalTarget       = $<HTMLInputElement>("goal-target");
const goalDate         = $<HTMLInputElement>("goal-date");
const saveGoalBtn      = $<HTMLButtonElement>("save-goal-btn");
const cancelGoalBtn    = $<HTMLButtonElement>("cancel-goal-btn");
const goalsListEl      = $<HTMLDivElement>("goals-list");

// Transfer
const toggleTransferBtn = $<HTMLButtonElement>("toggle-transfer");
const transferForm      = $<HTMLDivElement>("transfer-form");
const transferFrom      = $<HTMLSelectElement>("transfer-from");
const transferTo        = $<HTMLSelectElement>("transfer-to");
const transferAmount    = $<HTMLInputElement>("transfer-amount");
const transferDate      = $<HTMLInputElement>("transfer-date");
const doTransferBtn     = $<HTMLButtonElement>("do-transfer-btn");

// Debt
const toggleDebtBtn    = $<HTMLButtonElement>("toggle-debt");
const debtForm         = $<HTMLDivElement>("debt-form");
const debtName         = $<HTMLInputElement>("debt-name");
const debtAmount       = $<HTMLInputElement>("debt-amount");
const debtType         = $<HTMLSelectElement>("debt-type");
const debtPerson       = $<HTMLInputElement>("debt-person");
const debtDue          = $<HTMLInputElement>("debt-due");
const saveDebtBtn      = $<HTMLButtonElement>("save-debt-btn");
const cancelDebtBtn    = $<HTMLButtonElement>("cancel-debt-btn");
const debtsListEl      = $<HTMLDivElement>("debts-list");

// PIN
const pinScreen        = $<HTMLDivElement>("pin-screen");
const pinTitle         = $<HTMLHeadingElement>("pin-title");
const pinDots          = $<HTMLDivElement>("pin-dots");
const pinError         = $<HTMLParagraphElement>("pin-error");
const pinSetupBtn      = $<HTMLButtonElement>("pin-setup-btn");
const pinSetupModal    = $<HTMLDivElement>("pin-setup-modal");
const pinSetupTitle    = $<HTMLHeadingElement>("pin-setup-title");
const pinSetupDots     = $<HTMLDivElement>("pin-setup-dots");
const removePinBtn     = $<HTMLButtonElement>("remove-pin-btn");
const cancelPinSetup   = $<HTMLButtonElement>("cancel-pin-setup");
const pdfReportBtn     = $<HTMLButtonElement>("pdf-report-btn");

// Installments
const toggleInstBtn    = $<HTMLButtonElement>("toggle-installments");
const instForm         = $<HTMLDivElement>("installment-form");
const instName         = $<HTMLInputElement>("inst-name");
const instTotal        = $<HTMLInputElement>("inst-total");
const instMonths       = $<HTMLInputElement>("inst-months");
const instStart        = $<HTMLInputElement>("inst-start");
const instAccount      = $<HTMLSelectElement>("inst-account");
const saveInstBtn      = $<HTMLButtonElement>("save-inst-btn");
const cancelInstBtn    = $<HTMLButtonElement>("cancel-inst-btn");
const instListEl       = $<HTMLDivElement>("installments-list");

// Currency
const currencySelect   = $<HTMLSelectElement>("currency-select");

// Annual overview
const annualYearSel    = $<HTMLSelectElement>("annual-year");
const annualListEl     = $<HTMLDivElement>("annual-list");

// Bulk actions
const bulkBar          = $<HTMLDivElement>("bulk-bar");
const bulkCount        = $<HTMLSpanElement>("bulk-count");
const bulkCatSel       = $<HTMLSelectElement>("bulk-category-sel");
const bulkDeleteBtn    = $<HTMLButtonElement>("bulk-delete-btn");
const bulkCancelBtn    = $<HTMLButtonElement>("bulk-cancel-btn");

// Notifications & PWA
const notifBtn         = $<HTMLButtonElement>("notif-btn");
const installBtn       = $<HTMLButtonElement>("install-btn");

dateInput.valueAsDate = new Date();

// ── Storage ───────────────────────────────────────────────────────────────────
function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}
function save(key: string, val: unknown): void {
  localStorage.setItem(key, JSON.stringify(val));
  if (key === SK) {
    syncToCloud({ transactions, accounts, budgets, goals, debts, installments }).catch(() => {});
  }
}
function saveAll(): void {
  save(SK, transactions);
  save(AK, accounts);
  save(BK, budgets);
  save(GK, goals);
  save(DK, debts);
  save(IK, installments);
  syncToCloud({ transactions, accounts, budgets, goals, debts, installments }).catch(() => {});
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function peso(n: number): string {
  const converted = Math.abs(n) * currency.rate;
  return currency.symbol + converted.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function ym(d: string): string { return d.slice(0, 7); }
function thisMonth(): string   { return new Date().toISOString().slice(0, 7); }

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg: string, type: "success" | "error" | "info" = "success"): void {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  $<HTMLDivElement>("toast-container").appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
function confirm(msg: string): Promise<boolean> {
  return new Promise(resolve => {
    confirmMsg.textContent = msg;
    confirmModal.classList.remove("hidden");
    const yes = () => { cleanup(); resolve(true); };
    const no  = () => { cleanup(); resolve(false); };
    const cleanup = () => {
      confirmModal.classList.add("hidden");
      confirmYes.removeEventListener("click", yes);
      confirmNo.removeEventListener("click", no);
    };
    confirmYes.addEventListener("click", yes);
    confirmNo.addEventListener("click", no);
  });
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(theme: string): void {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.textContent = theme === "dark" ? "🌙" : "☀️";
  save(TK, theme);
}

// ── Calculations ──────────────────────────────────────────────────────────────
function accountBalance(accountId: string): number {
  const acc = accounts.find(a => a.id === accountId);
  const init = acc ? acc.initialBalance : 0;
  return transactions
    .filter(t => t.account === accountId)
    .reduce((s, t) => t.type === "income" ? s + t.amount : s - t.amount, init);
}

function totalBalance(): number {
  return accounts.reduce((s, a) => s + accountBalance(a.id), 0);
}

function scopedTx(): Transaction[] {
  return activeAccount === "all"
    ? transactions
    : transactions.filter(t => t.account === activeAccount);
}

function totalIncome(txs = scopedTx()): number {
  return txs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
}
function totalExpense(txs = scopedTx()): number {
  return txs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
}

function savingsRate(): { rate: number; label: string } {
  const now = thisMonth();
  const txs = scopedTx().filter(t => ym(t.date) === now);
  const inc = totalIncome(txs);
  const exp = totalExpense(txs);
  if (inc === 0) return { rate: 0, label: "no income this month" };
  const rate = Math.max(0, Math.round(((inc - exp) / inc) * 100));
  return { rate, label: "this month" };
}

function avgDailySpend(): number {
  const now = thisMonth();
  const txs = scopedTx().filter(t => t.type === "expense" && ym(t.date) === now);
  const total = txs.reduce((s, t) => s + t.amount, 0);
  const day = new Date().getDate();
  return day > 0 ? total / day : 0;
}

function topCategory(): string {
  const now = thisMonth();
  const map: Record<string, number> = {};
  scopedTx().filter(t => t.type === "expense" && ym(t.date) === now)
    .forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
  const entries = Object.entries(map) as [string, number][];
  if (!entries.length) return "—";
  return "Top: " + entries.sort((a, b) => b[1] - a[1])[0][0];
}

function monthlyExpByCategory(month: string): Record<string, number> {
  const map: Record<string, number> = {};
  scopedTx().filter(t => t.type === "expense" && ym(t.date) === month)
    .forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
  return map;
}

// ── Recurring ─────────────────────────────────────────────────────────────────
function processRecurring(): void {
  const now = thisMonth();
  const toAdd: Transaction[] = [];
  transactions.filter(t => t.recurring && ym(t.date) !== now).forEach(t => {
    const exists = transactions.some(x =>
      x.recurring && x.desc === t.desc && x.type === t.type &&
      x.category === t.category && x.amount === t.amount && ym(x.date) === now
    );
    if (!exists) toAdd.push({ ...t, id: uid(), date: now + "-01" });
  });
  if (toAdd.length) { transactions.push(...toAdd); save(SK, transactions); }
}

// ── Filters ───────────────────────────────────────────────────────────────────
function filtered(): Transaction[] {
  const q   = searchInput.value.toLowerCase();
  const mon = filterMonth.value;
  const typ = filterType.value;
  const cat = filterCat.value;
  const acc = filterAccount.value;
  return scopedTx().filter(t => {
    if (q && !t.desc.toLowerCase().includes(q) &&
             !t.category.toLowerCase().includes(q) &&
             !(t.notes || "").toLowerCase().includes(q) &&
             !t.tags.join(" ").toLowerCase().includes(q)) return false;
    if (mon && ym(t.date) !== mon) return false;
    if (typ && t.type !== typ) return false;
    if (cat && t.category !== cat) return false;
    if (acc && t.account !== acc) return false;
    return true;
  });
}

function populateMonthFilter(): void {
  const months = [...new Set(transactions.map(t => ym(t.date)))].sort().reverse();
  const cur = filterMonth.value;
  filterMonth.innerHTML = '<option value="">All Months</option>';
  months.forEach(m => {
    const [y, mo] = m.split("-");
    const label = new Date(parseInt(y), parseInt(mo) - 1)
      .toLocaleDateString("en-PH", { month: "long", year: "numeric" });
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = label;
    if (m === cur) opt.selected = true;
    filterMonth.appendChild(opt);
  });
}

function populateAccountSelects(): void {
  const selects = [accountSelect, editAccountSel, filterAccount];
  selects.forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = sel === filterAccount
      ? '<option value="">All Accounts</option>'
      : "";
    accounts.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id; opt.textContent = a.name;
      if (a.id === cur) opt.selected = true;
      sel.appendChild(opt);
    });
    if (!cur && sel !== filterAccount) sel.value = accounts[0]?.id || "";
  });
  [transferFrom, transferTo].forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = "";
    accounts.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id; opt.textContent = a.name;
      if (a.id === cur) opt.selected = true;
      sel.appendChild(opt);
    });
  });
  if (accounts.length > 1) transferTo.value = accounts[1].id;
  const icur = instAccount.value;
  instAccount.innerHTML = "";
  accounts.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id; opt.textContent = a.name;
    if (a.id === icur) opt.selected = true;
    instAccount.appendChild(opt);
  });
}

// ── Render Account Tabs ───────────────────────────────────────────────────────
function renderAccountTabs(): void {
  accountTabsEl.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = "account-tab" + (activeAccount === "all" ? " active" : "");
  allBtn.innerHTML = `All <span class="tab-bal">${peso(totalBalance())}</span>`;
  allBtn.addEventListener("click", () => { activeAccount = "all"; currentPage = 1; render(); });
  accountTabsEl.appendChild(allBtn);

  accounts.forEach(a => {
    const bal = accountBalance(a.id);
    const btn = document.createElement("button");
    btn.className = "account-tab" + (activeAccount === a.id ? " active" : "");
    btn.innerHTML = `${esc(a.name)} <span class="tab-bal">${peso(bal)}</span>
      <button class="del-account-btn" data-id="${a.id}" title="Delete account">✕</button>`;
    btn.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("del-account-btn")) return;
      activeAccount = a.id; currentPage = 1; render();
    });
    accountTabsEl.appendChild(btn);
  });

  accountTabsEl.querySelectorAll<HTMLButtonElement>(".del-account-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      const acc = accounts.find(a => a.id === id);
      const ok = await confirm(`Delete account "${acc?.name}"? Transactions will be moved to Cash.`);
      if (!ok) return;
      transactions.forEach(t => { if (t.account === id) t.account = "default"; });
      accounts = accounts.filter(a => a.id !== id);
      if (activeAccount === id) activeAccount = "all";
      saveAll(); render();
      toast(`Account "${acc?.name}" deleted`);
    });
  });
}

// ── Render Summary ────────────────────────────────────────────────────────────
function renderSummary(): void {
  const txs = scopedTx();
  const bal = activeAccount === "all"
    ? totalBalance()
    : accountBalance(activeAccount);

  const balEl = $<HTMLSpanElement>("balance");
  balEl.textContent = peso(bal);
  balEl.style.color = bal < 0 ? "var(--expense)" : "var(--accent)";

  const accName = activeAccount === "all"
    ? "All Accounts"
    : accounts.find(a => a.id === activeAccount)?.name || "";
  $<HTMLSpanElement>("balance-account").textContent = accName;
  $<HTMLSpanElement>("total-income").textContent  = peso(totalIncome(txs));
  $<HTMLSpanElement>("total-expense").textContent = peso(totalExpense(txs));

  const sr = savingsRate();
  $<HTMLSpanElement>("savings-rate").textContent = sr.rate + "%";
  $<HTMLSpanElement>("savings-sub").textContent  = sr.label;

  $<HTMLSpanElement>("avg-daily").textContent  = peso(avgDailySpend());
  $<HTMLSpanElement>("top-category").textContent = topCategory();

  const fc = spendingForecast();
  $<HTMLSpanElement>("forecast-amount").textContent = peso(fc.amount);
  $<HTMLSpanElement>("forecast-sub").textContent    = fc.label;
  const fcEl = $<HTMLSpanElement>("forecast-amount");
  fcEl.style.color = fc.label.includes("⚠") ? "var(--expense)" : "var(--warn)";

  alertEl.classList.toggle("hidden", bal > 0);
}

// ── Render Budgets ────────────────────────────────────────────────────────────
function renderBudgets(): void {
  const spent = monthlyExpByCategory(thisMonth());
  const overCount = budgets.filter(b => (spent[b.category] || 0) > b.limit).length;
  budgetBadge.textContent = overCount > 0 ? `${overCount} over!` : "";
  budgetBadge.style.display = overCount > 0 ? "inline-block" : "none";
  if (!budgets.length) { budgetListEl.innerHTML = ""; return; }

  budgetListEl.innerHTML = budgets.map(b => {
    const used = spent[b.category] || 0;
    const pct  = Math.min(100, Math.round(used / b.limit * 100));
    const over = used > b.limit;
    return `<div class="budget-item">
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

  budgetListEl.querySelectorAll<HTMLButtonElement>(".delete-budget-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      budgets = budgets.filter(b => b.category !== btn.dataset.cat);
      save(BK, budgets); renderBudgets();
      toast("Budget removed");
    });
  });
}

// ── Render Transaction List (paginated) ───────────────────────────────────────
function renderList(): void {
  const list = filtered().sort((a, b) => b.date.localeCompare(a.date));
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const page = list.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!page.length) {
    listEl.innerHTML = '<p class="empty-msg">No transactions found.</p>';
    paginationEl.innerHTML = "";
    return;
  }

  listEl.innerHTML = page.map(t => {
    const accName = accounts.find(a => a.id === t.account)?.name || "Cash";
    const tagsHtml = t.tags.length
      ? t.tags.map(tag => `<span class="tag">${esc(tag)}</span>`).join("")
      : "";
    const checked = selectedIds.has(t.id) ? "checked" : "";
    return `<div class="transaction-item ${t.type} ${selectedIds.has(t.id) ? "selected" : ""}">
      <label class="bulk-check" title="Select">
        <input type="checkbox" class="tx-checkbox" data-id="${t.id}" ${checked}/>
      </label>
      <div class="tx-info">
        <span class="tx-desc">${esc(t.desc)}${t.recurring ? ' <span class="recurring-badge">🔁</span>' : ""}</span>
        <span class="tx-meta">${t.category} · ${accName} · ${fmtDate(t.date)}</span>
        ${t.notes ? `<span class="tx-notes">${esc(t.notes)}</span>` : ""}
        ${tagsHtml ? `<div class="tx-tags">${tagsHtml}</div>` : ""}
      </div>
      <div class="tx-right">
        <span class="tx-amount ${t.type}">${t.type === "income" ? "+" : "-"}${peso(t.amount)}</span>
        <button class="edit-btn"   data-id="${t.id}" title="Edit">✏</button>
        <button class="delete-btn" data-id="${t.id}" title="Delete">✕</button>
      </div>
    </div>`;
  }).join("");

  listEl.querySelectorAll<HTMLButtonElement>(".edit-btn").forEach(btn =>
    btn.addEventListener("click", () => openEdit(btn.dataset.id!))
  );
  listEl.querySelectorAll<HTMLInputElement>(".tx-checkbox").forEach(chk => {
    chk.addEventListener("change", () => {
      if (chk.checked) selectedIds.add(chk.dataset.id!);
      else selectedIds.delete(chk.dataset.id!);
      updateBulkBar();
      renderList();
    });
  });
  listEl.querySelectorAll<HTMLButtonElement>(".delete-btn").forEach(btn =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      const idx = transactions.findIndex(t => t.id === id);
      const tx  = transactions[idx];
      transactions = transactions.filter(t => t.id !== id);
      save(SK, transactions); render();
      undoStack = { tx, idx };
      toastUndo("Transaction deleted");
    })
  );

  paginationEl.innerHTML = "";
  if (totalPages <= 1) return;
  const prev = document.createElement("button");
  prev.className = "page-btn"; prev.textContent = "‹";
  prev.disabled = currentPage === 1;
  prev.addEventListener("click", () => { currentPage--; renderList(); });
  paginationEl.appendChild(prev);

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.className = "page-btn" + (i === currentPage ? " active" : "");
    btn.textContent = String(i);
    btn.addEventListener("click", () => { currentPage = i; renderList(); });
    paginationEl.appendChild(btn);
  }

  const next = document.createElement("button");
  next.className = "page-btn"; next.textContent = "›";
  next.disabled = currentPage === totalPages;
  next.addEventListener("click", () => { currentPage++; renderList(); });
  paginationEl.appendChild(next);
}

// ── Pie Chart ─────────────────────────────────────────────────────────────────
function renderPie(): void {
  const canvas = $<HTMLCanvasElement>("pie-chart");
  const legend = $<HTMLDivElement>("legend");
  const ctx    = canvas.getContext("2d")!;
  const map: Record<string, number> = {};
  scopedTx().filter(t => t.type === "expense")
    .forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
  const entries = Object.entries(map) as [string, number][];
  const total   = entries.reduce((s, [, v]) => s + v, 0);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  legend.innerHTML = "";

  if (!entries.length) {
    ctx.fillStyle = "var(--surface2, #273549)";
    ctx.beginPath(); ctx.arc(150, 150, 100, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#94a3b8"; ctx.font = "14px Segoe UI"; ctx.textAlign = "center";
    ctx.fillText("No expenses yet", 150, 155);
    return;
  }

  let angle = -Math.PI / 2;
  entries.forEach(([cat, val], i) => {
    const slice = (val / total) * Math.PI * 2;
    const color = COLORS[i % COLORS.length];
    ctx.beginPath(); ctx.moveTo(150, 150);
    ctx.arc(150, 150, 110, angle, angle + slice);
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    angle += slice;
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-dot" style="background:${color}"></span>
      <span>${cat}: ${peso(val)} (${Math.round(val / total * 100)}%)</span>`;
    legend.appendChild(item);
  });
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────
function renderBar(): void {
  const canvas = $<HTMLCanvasElement>("bar-chart");
  const ctx    = canvas.getContext("2d")!;
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  const txs = scopedTx();
  const inc = months.map(m => txs.filter(t => t.type === "income"  && ym(t.date) === m).reduce((s, t) => s + t.amount, 0));
  const exp = months.map(m => txs.filter(t => t.type === "expense" && ym(t.date) === m).reduce((s, t) => s + t.amount, 0));

  const W = canvas.width, H = canvas.height;
  const pL = 72, pR = 20, pT = 20, pB = 50;
  const cW = W - pL - pR, cH = H - pT - pB;
  const maxVal = Math.max(...inc, ...exp, 1);

  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i <= 4; i++) {
    const y = pT + (cH / 4) * i;
    ctx.strokeStyle = "rgba(148,163,184,0.1)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(W - pR, y); ctx.stroke();
    ctx.fillStyle = "#94a3b8"; ctx.font = "11px Segoe UI"; ctx.textAlign = "right";
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
    const label = new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString("en-PH", { month: "short" });
    ctx.fillStyle = "#94a3b8"; ctx.font = "11px Segoe UI"; ctx.textAlign = "center";
    ctx.fillText(label, cx, H - pB + 18);
  });
  ctx.fillStyle = "#4ade80"; ctx.fillRect(pL, H - 14, 12, 10);
  ctx.fillStyle = "#94a3b8"; ctx.font = "11px Segoe UI"; ctx.textAlign = "left";
  ctx.fillText("Income", pL + 16, H - 5);
  ctx.fillStyle = "#f87171"; ctx.fillRect(pL + 80, H - 14, 12, 10);
  ctx.fillStyle = "#94a3b8"; ctx.fillText("Expense", pL + 96, H - 5);
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function openEdit(id: string): void {
  const t = transactions.find(t => t.id === id);
  if (!t) return;
  editId.value     = t.id;
  editDesc.value   = t.desc;
  editAmount.value = String(t.amount);
  editType.value   = t.type;
  editCat.value    = t.category;
  editDate.value   = t.date;
  editNotes.value  = t.notes || "";
  editTags.value   = t.tags.join(", ");
  populateAccountSelects();
  editAccountSel.value = t.account;
  editModal.classList.remove("hidden");
}
function closeEdit(): void { editModal.classList.add("hidden"); }

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCSV(): void {
  const rows = [["Date","Description","Type","Category","Account","Amount","Notes","Tags","Recurring"]];
  [...transactions].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
    const accName = accounts.find(a => a.id === t.account)?.name || "Cash";
    rows.push([t.date, t.desc, t.type, t.category, accName,
      t.amount.toFixed(2), t.notes || "", t.tags.join(";"), t.recurring ? "Yes" : "No"]);
  });
  const csv  = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a"); a.href = url; a.download = "transactions.csv"; a.click();
  URL.revokeObjectURL(url);
  toast("CSV exported");
}

// ── Import CSV ────────────────────────────────────────────────────────────────
function importCSV(file: File): void {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target?.result as string;
    const lines = text.trim().split("\n").slice(1);
    let count = 0;
    lines.forEach(line => {
      const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g)?.map(c => c.replace(/^"|"$/g, "").replace(/""/g, '"')) || [];
      if (cols.length < 6) return;
      const [date, desc, type, category, , amountStr, notes, tagsStr, recurring] = cols;
      const amount = parseFloat(amountStr);
      if (!date || !desc || !amount) return;
      transactions.push({
        id: uid(), desc, amount,
        type: type === "income" ? "income" : "expense",
        category: category || "Other",
        account: accounts[0]?.id || "default",
        date, recurring: recurring?.toLowerCase() === "yes",
        notes: notes || "",
        tags: tagsStr ? tagsStr.split(";").map(t => t.trim()).filter(Boolean) : []
      });
      count++;
    });
    save(SK, transactions); render();
    toast(`Imported ${count} transactions`, "success");
  };
  reader.readAsText(file);
}

// ── Backup / Restore ──────────────────────────────────────────────────────────
function backup(): void {
  const data = { transactions, accounts, budgets, goals, debts, version: 2 };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a"); a.href = url;
  a.download = `finance-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url);
  toast("Backup downloaded");
}

function restore(file: File): void {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target?.result as string);
      const ok = await confirm("This will replace all current data. Continue?");
      if (!ok) return;
      transactions = data.transactions || [];
      accounts     = data.accounts     || [{ id: "default", name: "Cash", initialBalance: 0 }];
      budgets      = data.budgets      || [];
      goals        = data.goals        || [];
      debts        = data.debts        || [];
      saveAll(); render();
      toast("Data restored successfully");
    } catch {
      toast("Invalid backup file", "error");
    }
  };
  reader.readAsText(file);
}

// ── Undo Toast ────────────────────────────────────────────────────────────────
function toastUndo(msg: string): void {
  const container = $<HTMLDivElement>("toast-container");
  const el = document.createElement("div");
  el.className = "toast toast-info show";
  el.innerHTML = `${msg} <button class="undo-btn">Undo</button>`;
  container.appendChild(el);
  const timer = setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); undoStack = null; }, 5000);
  el.querySelector<HTMLButtonElement>(".undo-btn")!.addEventListener("click", () => {
    clearTimeout(timer);
    if (undoStack) {
      transactions.splice(undoStack.idx, 0, undoStack.tx);
      undoStack = null;
      save(SK, transactions); render();
      toast("Transaction restored");
    }
    el.classList.remove("show"); setTimeout(() => el.remove(), 300);
  });
}

// ── Net Worth Line Chart ──────────────────────────────────────────────────────
function renderLine(): void {
  const canvas = $<HTMLCanvasElement>("line-chart");
  const ctx    = canvas.getContext("2d")!;
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }

  const netWorth: number[] = [];
  let running = accounts.reduce((s, a) => s + a.initialBalance, 0);
  months.forEach(m => {
    const txs = transactions.filter(t => ym(t.date) === m);
    running += txs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    running -= txs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    netWorth.push(running);
  });

  const W = canvas.width, H = canvas.height;
  const pL = 72, pR = 20, pT = 20, pB = 50;
  const cW = W - pL - pR, cH = H - pT - pB;
  const minVal = Math.min(...netWorth);
  const maxVal = Math.max(...netWorth, 1);
  const range  = maxVal - minVal || 1;

  ctx.clearRect(0, 0, W, H);

  for (let i = 0; i <= 4; i++) {
    const y = pT + (cH / 4) * i;
    ctx.strokeStyle = "rgba(148,163,184,0.1)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(W - pR, y); ctx.stroke();
    const val = maxVal - (range / 4) * i;
    ctx.fillStyle = "#94a3b8"; ctx.font = "11px Segoe UI"; ctx.textAlign = "right";
    ctx.fillText(peso(val), pL - 6, y + 4);
  }

  if (minVal < 0) {
    const zy = pT + ((maxVal) / range) * cH;
    ctx.strokeStyle = "rgba(248,113,113,0.3)"; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pL, zy); ctx.lineTo(W - pR, zy); ctx.stroke();
    ctx.setLineDash([]);
  }

  const pts = netWorth.map((v, i) => ({
    x: pL + (i / (months.length - 1)) * cW,
    y: pT + ((maxVal - v) / range) * cH
  }));

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pT + cH);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, pT + cH);
  ctx.closePath();
  ctx.fillStyle = "rgba(56,189,248,0.08)";
  ctx.fill();

  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2.5;
  ctx.stroke();

  pts.forEach((p, i) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = netWorth[i] >= 0 ? "#38bdf8" : "#f87171"; ctx.fill();
  });

  months.forEach((m, i) => {
    if (i % 2 !== 0) return;
    const [y, mo] = m.split("-");
    const label = new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString("en-PH", { month: "short" });
    ctx.fillStyle = "#94a3b8"; ctx.font = "11px Segoe UI"; ctx.textAlign = "center";
    ctx.fillText(label, pts[i].x, H - pB + 18);
  });
}

// ── Spending Insights ─────────────────────────────────────────────────────────
function renderInsights(): void {
  const el = $<HTMLDivElement>("insights-list");
  const insights: { icon: string; text: string; type: "good" | "warn" | "info" }[] = [];
  const now  = thisMonth();
  const prev = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();

  const nowTxs  = transactions.filter(t => ym(t.date) === now);
  const prevTxs = transactions.filter(t => ym(t.date) === prev);

  const nowExp  = totalExpense(nowTxs);
  const prevExp = totalExpense(prevTxs);
  const nowInc  = totalIncome(nowTxs);

  const nowCats: Record<string, number>  = {};
  const prevCats: Record<string, number> = {};
  nowTxs.filter(t => t.type === "expense").forEach(t => { nowCats[t.category]  = (nowCats[t.category]  || 0) + t.amount; });
  prevTxs.filter(t => t.type === "expense").forEach(t => { prevCats[t.category] = (prevCats[t.category] || 0) + t.amount; });

  Object.entries(nowCats).forEach(([cat, val]) => {
    const p = prevCats[cat] || 0;
    if (p > 0) {
      const diff = Math.round(((val - p) / p) * 100);
      if (diff >= 30) insights.push({ icon: "📈", text: `You spent ${diff}% more on ${cat} vs last month (${peso(val)} vs ${peso(p)})`, type: "warn" });
      else if (diff <= -20) insights.push({ icon: "📉", text: `Great! You spent ${Math.abs(diff)}% less on ${cat} vs last month`, type: "good" });
    }
  });

  const sr = nowInc > 0 ? Math.round(((nowInc - nowExp) / nowInc) * 100) : 0;
  if (sr >= 20) insights.push({ icon: "🎉", text: `Solid savings rate of ${sr}% this month. Keep it up!`, type: "good" });
  else if (sr < 0) insights.push({ icon: "⚠️", text: `You're spending more than you earn this month by ${peso(nowExp - nowInc)}`, type: "warn" });
  else if (nowInc > 0) insights.push({ icon: "💡", text: `Your savings rate is ${sr}%. Try to aim for at least 20%.`, type: "info" });

  if (prevExp > 0 && nowExp > 0) {
    const diff = Math.round(((nowExp - prevExp) / prevExp) * 100);
    if (diff >= 20) insights.push({ icon: "🔴", text: `Total spending is up ${diff}% from last month`, type: "warn" });
    else if (diff <= -10) insights.push({ icon: "🟢", text: `Total spending is down ${Math.abs(diff)}% from last month`, type: "good" });
  }

  const spent = monthlyExpByCategory(now);
  budgets.forEach(b => {
    const used = spent[b.category] || 0;
    const pct  = Math.round(used / b.limit * 100);
    if (pct >= 80 && pct < 100) insights.push({ icon: "⚡", text: `${b.category} budget is ${pct}% used (${peso(used)} of ${peso(b.limit)})`, type: "warn" });
  });

  const upcoming = transactions.filter(t => t.recurring && t.type === "expense");
  if (upcoming.length) {
    const total = [...new Map(upcoming.map(t => [`${t.desc}-${t.amount}`, t])).values()]
      .reduce((s, t) => s + t.amount, 0);
    insights.push({ icon: "🔁", text: `${upcoming.length} recurring expense(s) totaling ${peso(total)} expected this month`, type: "info" });
  }

  if (!insights.length) {
    el.innerHTML = '<p class="empty-msg">Add more transactions to get personalized insights.</p>';
    return;
  }

  el.innerHTML = insights.map(i =>
    `<div class="insight-item insight-${i.type}">
      <span class="insight-icon">${i.icon}</span>
      <span>${i.text}</span>
    </div>`
  ).join("");
}

// ── Goals ─────────────────────────────────────────────────────────────────────
function renderGoals(): void {
  if (!goals.length) {
    goalsListEl.innerHTML = '<p class="empty-msg" style="padding:12px 0">No goals yet. Set one above.</p>';
    return;
  }
  goalsListEl.innerHTML = goals.map(g => {
    const pct  = Math.min(100, Math.round((g.saved / g.target) * 100));
    const done = g.saved >= g.target;
    const due  = g.dueDate ? ` · Due ${fmtDate(g.dueDate)}` : "";
    return `<div class="goal-item ${done ? "done" : ""}">
      <div class="goal-top">
        <span class="goal-name">${esc(g.name)}${done ? " ✅" : ""}</span>
        <span class="goal-nums">${peso(g.saved)} / ${peso(g.target)}${due}</span>
        <div class="goal-actions">
          <button class="goal-add-btn ghost-btn" data-id="${g.id}" title="Add savings">+</button>
          <button class="goal-del-btn" data-id="${g.id}" title="Delete">✕</button>
        </div>
      </div>
      <div class="budget-bar-bg">
        <div class="budget-bar-fill" style="width:${pct}%;background:${done ? "var(--income)" : "var(--savings)"}"></div>
      </div>
      <span style="font-size:0.76rem;color:var(--muted);margin-top:3px;display:block">${pct}% complete</span>
    </div>`;
  }).join("");

  goalsListEl.querySelectorAll<HTMLButtonElement>(".goal-del-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      goals = goals.filter(g => g.id !== btn.dataset.id);
      save(GK, goals); renderGoals();
      toast("Goal removed", "info");
    });
  });

  goalsListEl.querySelectorAll<HTMLButtonElement>(".goal-add-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const amtStr = window.prompt("How much to add to this goal? (₱)");
      if (!amtStr) return;
      const amt = parseFloat(amtStr);
      if (isNaN(amt) || amt <= 0) return;
      const g = goals.find(g => g.id === btn.dataset.id);
      if (!g) return;
      g.saved = Math.min(g.target, g.saved + amt);
      save(GK, goals); renderGoals();
      toast(`Added ${peso(amt)} to "${g.name}"`);
    });
  });
}

// ── Debts ─────────────────────────────────────────────────────────────────────
function renderDebts(): void {
  const active  = debts.filter(d => !d.settled);
  const settled = debts.filter(d => d.settled);

  if (!debts.length) {
    debtsListEl.innerHTML = '<p class="empty-msg" style="padding:12px 0">No debts tracked. Add one above.</p>';
    return;
  }

  const renderGroup = (list: Debt[]) => list.map(d => {
    const due = d.dueDate ? ` · Due ${fmtDate(d.dueDate)}` : "";
    const overdue = d.dueDate && !d.settled && new Date(d.dueDate) < new Date();
    return `<div class="debt-item ${d.settled ? "settled" : ""} ${overdue ? "overdue" : ""}">
      <div class="debt-info">
        <span class="debt-name">${esc(d.name)}</span>
        <span class="debt-meta">${d.type === "owe" ? "You owe" : "Owes you"} · ${esc(d.person)}${due}${overdue ? " ⚠ Overdue" : ""}</span>
      </div>
      <div class="debt-right">
        <span class="debt-amount ${d.type === "owe" ? "owe" : "lent"}">${d.type === "owe" ? "-" : "+"}${peso(d.amount)}</span>
        ${!d.settled ? `<button class="settle-btn ghost-btn" data-id="${d.id}">Settle</button>` : '<span class="settled-badge">Settled</span>'}
        <button class="del-debt-btn" data-id="${d.id}">✕</button>
      </div>
    </div>`;
  }).join("");

  debtsListEl.innerHTML = renderGroup(active);
  if (settled.length) {
    debtsListEl.innerHTML += `<div class="settled-section"><span class="settled-label">Settled</span>${renderGroup(settled)}</div>`;
  }

  debtsListEl.querySelectorAll<HTMLButtonElement>(".settle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = debts.find(d => d.id === btn.dataset.id);
      if (d) { d.settled = true; save(DK, debts); renderDebts(); toast(`"${d.name}" marked as settled`); }
    });
  });
  debtsListEl.querySelectorAll<HTMLButtonElement>(".del-debt-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      debts = debts.filter(d => d.id !== btn.dataset.id);
      save(DK, debts); renderDebts(); toast("Debt removed", "info");
    });
  });
}

// ── Auto-categorize ───────────────────────────────────────────────────────────
function autoCategory(desc: string): string {
  const lower = desc.toLowerCase();
  for (const [cat, keywords] of Object.entries(CAT_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return cat;
  }
  return "";
}

// ── Forecast ──────────────────────────────────────────────────────────────────
function spendingForecast(): { amount: number; label: string } {
  const now  = thisMonth();
  const day  = new Date().getDate();
  const days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const spent = scopedTx().filter(t => t.type === "expense" && ym(t.date) === now)
    .reduce((s, t) => s + t.amount, 0);
  if (day === 0) return { amount: 0, label: "projected spend" };
  const projected = (spent / day) * days;
  const inc = totalIncome(scopedTx().filter(t => ym(t.date) === now));
  const label = projected > inc && inc > 0 ? "⚠ over income" : "projected spend";
  return { amount: projected, label };
}

// ── PIN Lock ──────────────────────────────────────────────────────────────────
function hashPin(pin: string): string {
  let h = 0;
  for (let i = 0; i < pin.length; i++) { h = (Math.imul(31, h) + pin.charCodeAt(i)) | 0; }
  return h.toString(36);
}

function updatePinDots(el: HTMLDivElement, len: number, total = 4): void {
  el.innerHTML = Array.from({ length: total }, (_, i) =>
    `<span class="pin-dot ${i < len ? "filled" : ""}"></span>`
  ).join("");
}

function showPinScreen(): void {
  pinBuffer = "";
  updatePinDots(pinDots, 0);
  pinError.classList.add("hidden");
  pinTitle.textContent = "Enter PIN";
  pinScreen.classList.remove("hidden");
}

function hidePinScreen(): void {
  pinScreen.classList.add("hidden");
  resetInactivity();
}

function checkPin(input: string): boolean {
  const stored = load<string>(PK, "");
  return !!stored && hashPin(input) === stored;
}

function resetInactivity(): void {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  const stored = load<string>(PK, "");
  if (!stored) return;
  inactivityTimer = setTimeout(() => { showPinScreen(); }, 5 * 60 * 1000);
}

function initPinLock(): void {
  const stored = load<string>(PK, "");
  if (stored) showPinScreen();
  else resetInactivity();
  ["click","keydown","mousemove","touchstart"].forEach(ev =>
    document.addEventListener(ev, resetInactivity, { passive: true })
  );
}

// PIN keypad — lock screen
document.querySelectorAll<HTMLButtonElement>(".pin-key[data-val]").forEach(btn => {
  btn.addEventListener("click", () => {
    const val = btn.dataset.val!;
    if (val === "clear") { pinBuffer = pinBuffer.slice(0, -1); }
    else if (val === "ok") {
      if (checkPin(pinBuffer)) { hidePinScreen(); }
      else {
        pinError.classList.remove("hidden");
        pinBuffer = "";
        updatePinDots(pinDots, 0);
        pinDots.classList.add("shake");
        setTimeout(() => pinDots.classList.remove("shake"), 500);
        return;
      }
    } else if (pinBuffer.length < 4) { pinBuffer += val; }
    updatePinDots(pinDots, pinBuffer.length);
  });
});

// PIN setup keypad
document.querySelectorAll<HTMLButtonElement>(".pin-key[data-setup]").forEach(btn => {
  btn.addEventListener("click", () => {
    const val = btn.dataset.setup!;
    if (val === "clear") { pinSetupBuffer = pinSetupBuffer.slice(0, -1); }
    else if (val === "ok") {
      if (pinSetupBuffer.length < 4) return;
      if (pinSetupStep === 0) {
        pinSetupFirst  = pinSetupBuffer;
        pinSetupBuffer = "";
        pinSetupStep   = 1;
        pinSetupTitle.textContent = "Confirm PIN";
        updatePinDots(pinSetupDots, 0);
        return;
      } else {
        if (pinSetupBuffer === pinSetupFirst) {
          save(PK, hashPin(pinSetupBuffer));
          pinSetupModal.classList.add("hidden");
          pinSetupStep = 0; pinSetupBuffer = ""; pinSetupFirst = "";
          toast("PIN set successfully 🔒");
          resetInactivity();
        } else {
          pinSetupTitle.textContent = "PINs don't match. Try again.";
          pinSetupStep = 0; pinSetupBuffer = ""; pinSetupFirst = "";
          updatePinDots(pinSetupDots, 0);
          return;
        }
      }
    } else if (pinSetupBuffer.length < 4) { pinSetupBuffer += val; }
    updatePinDots(pinSetupDots, pinSetupBuffer.length);
  });
});

pinSetupBtn.addEventListener("click", () => {
  pinSetupStep = 0; pinSetupBuffer = ""; pinSetupFirst = "";
  pinSetupTitle.textContent = "Set PIN Lock";
  updatePinDots(pinSetupDots, 0);
  pinSetupModal.classList.remove("hidden");
});
removePinBtn.addEventListener("click", () => {
  localStorage.removeItem(PK);
  pinSetupModal.classList.add("hidden");
  if (inactivityTimer) clearTimeout(inactivityTimer);
  toast("PIN removed", "info");
});
cancelPinSetup.addEventListener("click", () => {
  pinSetupModal.classList.add("hidden");
  pinSetupStep = 0; pinSetupBuffer = ""; pinSetupFirst = "";
});

// ── Bill Calendar ─────────────────────────────────────────────────────────────
function renderCalendar(): void {
  const el   = $<HTMLDivElement>("bill-calendar");
  const now  = new Date();
  const year = now.getFullYear();
  const month= now.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const first= new Date(year, month, 1).getDay();

  const recurring = transactions.filter(t => t.recurring && t.type === "expense");
  const unique = [...new Map(recurring.map(t => [`${t.desc}-${t.amount}`, t])).values()];

  const monthName = now.toLocaleDateString("en-PH", { month: "long", year: "numeric" });

  let html = `<div class="cal-header">${monthName}</div>
    <div class="cal-grid">
      ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => `<div class="cal-day-name">${d}</div>`).join("")}
      ${Array(first).fill('<div class="cal-cell empty"></div>').join("")}`;

  for (let d = 1; d <= days; d++) {
    const bills = unique.filter(t => {
      const txDay = parseInt(t.date.split("-")[2]);
      return txDay === d || (d === 1 && txDay > days);
    });
    const isToday = d === now.getDate();
    html += `<div class="cal-cell ${isToday ? "today" : ""} ${bills.length ? "has-bill" : ""}">
      <span class="cal-num">${d}</span>
      ${bills.map(b => `<span class="cal-bill" title="${esc(b.desc)}: ${peso(b.amount)}">${esc(b.desc.slice(0,8))}</span>`).join("")}
    </div>`;
  }
  html += "</div>";

  if (unique.length) {
    html += `<div class="cal-legend"><strong>Recurring Bills:</strong> ${unique.map(b =>
      `<span class="cal-bill-item">${esc(b.desc)} — ${peso(b.amount)}</span>`
    ).join("")}</div>`;
  } else {
    html += `<p class="empty-msg" style="padding:12px 0">No recurring bills. Mark transactions as 🔁 recurring to see them here.</p>`;
  }

  el.innerHTML = html;
}

// ── PDF / Print Report ────────────────────────────────────────────────────────
function printReport(): void {
  const now   = thisMonth();
  const [y, mo] = now.split("-");
  const monthLabel = new Date(parseInt(y), parseInt(mo) - 1)
    .toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  const txs   = scopedTx().filter(t => ym(t.date) === now);
  const inc   = totalIncome(txs);
  const exp   = totalExpense(txs);
  const bal   = inc - exp;
  const sr    = inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0;

  const catMap: Record<string, number> = {};
  txs.filter(t => t.type === "expense").forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + t.amount; });
  const catRows = Object.entries(catMap).sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => `<tr><td>${cat}</td><td style="text-align:right">${peso(val)}</td></tr>`).join("");

  const txRows = [...txs].sort((a, b) => b.date.localeCompare(a.date))
    .map(t => `<tr>
      <td>${fmtDate(t.date)}</td>
      <td>${esc(t.desc)}</td>
      <td>${t.category}</td>
      <td style="text-align:right;color:${t.type === "income" ? "#16a34a" : "#dc2626"}">
        ${t.type === "income" ? "+" : "-"}${peso(t.amount)}
      </td>
    </tr>`).join("");

  const win = window.open("", "_blank")!;
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"/>
    <title>Finance Report — ${monthLabel}</title>
    <style>
      body { font-family: 'Segoe UI', sans-serif; padding: 32px; color: #0f172a; max-width: 800px; margin: 0 auto; }
      h1 { font-size: 1.5rem; margin-bottom: 4px; }
      .sub { color: #64748b; font-size: 0.9rem; margin-bottom: 24px; }
      .cards { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 24px; }
      .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
      .card .lbl { font-size: 0.7rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
      .card .val { font-size: 1.2rem; font-weight: 700; margin-top: 4px; }
      .inc { color: #16a34a; } .exp { color: #dc2626; } .acc { color: #0284c7; } .sav { color: #7c3aed; }
      h2 { font-size: 1rem; margin: 20px 0 10px; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; }
      table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
      th { text-align: left; padding: 8px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; }
      td { padding: 7px 8px; border-bottom: 1px solid #f1f5f9; }
      @media print { body { padding: 16px; } }
    </style>
  </head><body>
    <h1>💰 Monthly Finance Report</h1>
    <p class="sub">${monthLabel} · Generated ${new Date().toLocaleDateString("en-PH")}</p>
    <div class="cards">
      <div class="card"><div class="lbl">Income</div><div class="val inc">${peso(inc)}</div></div>
      <div class="card"><div class="lbl">Expenses</div><div class="val exp">${peso(exp)}</div></div>
      <div class="card"><div class="lbl">Net</div><div class="val acc">${bal >= 0 ? "+" : ""}${peso(bal)}</div></div>
      <div class="card"><div class="lbl">Savings Rate</div><div class="val sav">${sr}%</div></div>
    </div>
    <h2>Spending by Category</h2>
    <table><thead><tr><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${catRows || "<tr><td colspan='2' style='color:#94a3b8;text-align:center'>No expenses</td></tr>"}</tbody></table>
    <h2>All Transactions</h2>
    <table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${txRows || "<tr><td colspan='4' style='color:#94a3b8;text-align:center'>No transactions</td></tr>"}</tbody></table>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

// ── Installments ──────────────────────────────────────────────────────────────
function renderInstallments(): void {
  if (!installments.length) {
    instListEl.innerHTML = '<p class="empty-msg" style="padding:12px 0">No installments tracked.</p>';
    return;
  }
  instListEl.innerHTML = installments.map(inst => {
    const monthly = inst.totalAmount / inst.months;
    const remaining = inst.months - inst.paidMonths;
    const pct = Math.round((inst.paidMonths / inst.months) * 100);
    const done = inst.paidMonths >= inst.months;
    const accName = accounts.find(a => a.id === inst.account)?.name || "Cash";
    return `<div class="inst-item ${done ? "done" : ""}">
      <div class="inst-top">
        <span class="inst-name">${esc(inst.name)}${done ? " ✅" : ""}</span>
        <span class="inst-meta">${accName} · ${peso(monthly)}/mo · ${remaining} mo left</span>
      </div>
      <div class="budget-bar-bg">
        <div class="budget-bar-fill" style="width:${pct}%;background:${done ? "var(--income)" : "var(--accent)"}"></div>
      </div>
      <div class="inst-actions">
        <span style="font-size:0.76rem;color:var(--muted)">${inst.paidMonths}/${inst.months} paid · ${peso(inst.totalAmount)} total</span>
        ${!done ? `<button class="ghost-btn inst-pay-btn" data-id="${inst.id}" style="padding:3px 10px;font-size:0.8rem">Pay Month</button>` : ""}
        <button class="inst-del-btn" data-id="${inst.id}">✕</button>
      </div>
    </div>`;
  }).join("");

  instListEl.querySelectorAll<HTMLButtonElement>(".inst-pay-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const inst = installments.find(i => i.id === btn.dataset.id);
      if (!inst || inst.paidMonths >= inst.months) return;
      const monthly = inst.totalAmount / inst.months;
      const d = new Date(); d.setDate(1);
      d.setMonth(d.getMonth() + inst.paidMonths);
      const date = d.toISOString().slice(0, 10);
      transactions.push({ id: uid(), desc: `${inst.name} (installment ${inst.paidMonths + 1}/${inst.months})`, amount: monthly, type: "expense", category: "Bills", account: inst.account, date, recurring: false, notes: "installment", tags: ["installment"] });
      inst.paidMonths++;
      save(SK, transactions); save(IK, installments);
      render(); toast(`Paid month ${inst.paidMonths}/${inst.months} for "${inst.name}"`);
    });
  });
  instListEl.querySelectorAll<HTMLButtonElement>(".inst-del-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      installments = installments.filter(i => i.id !== btn.dataset.id);
      save(IK, installments); renderInstallments(); toast("Installment removed", "info");
    });
  });
}

// ── Annual Overview ───────────────────────────────────────────────────────────
function renderAnnual(): void {
  const year = parseInt(annualYearSel.value) || new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    return `${year}-${m}`;
  });

  let totalInc = 0, totalExp = 0;
  const rows = months.map(m => {
    const txs = transactions.filter(t => ym(t.date) === m);
    const inc = totalIncome(txs);
    const exp = totalExpense(txs);
    const net = inc - exp;
    totalInc += inc; totalExp += exp;
    const label = new Date(year, parseInt(m.split("-")[1]) - 1).toLocaleDateString("en-PH", { month: "short" });
    if (!inc && !exp) return `<div class="annual-row empty"><span>${label}</span><span>—</span><span>—</span><span>—</span></div>`;
    return `<div class="annual-row">
      <span class="annual-month">${label}</span>
      <span class="annual-inc">+${peso(inc)}</span>
      <span class="annual-exp">-${peso(exp)}</span>
      <span class="annual-net ${net >= 0 ? "pos" : "neg"}">${net >= 0 ? "+" : ""}${peso(net)}</span>
    </div>`;
  }).join("");

  const netYear = totalInc - totalExp;
  const srYear  = totalInc > 0 ? Math.round(((totalInc - totalExp) / totalInc) * 100) : 0;

  annualListEl.innerHTML = `
    <div class="annual-header">
      <span>Month</span><span>Income</span><span>Expenses</span><span>Net</span>
    </div>
    ${rows}
    <div class="annual-total">
      <span>Total ${year}</span>
      <span style="color:var(--income)">+${peso(totalInc)}</span>
      <span style="color:var(--expense)">-${peso(totalExp)}</span>
      <span style="color:${netYear >= 0 ? "var(--income)" : "var(--expense)"}">${netYear >= 0 ? "+" : ""}${peso(netYear)} · ${srYear}% saved</span>
    </div>`;
}

function populateAnnualYears(): void {
  const years = [...new Set(transactions.map(t => t.date.slice(0, 4)))].sort().reverse();
  const cur = annualYearSel.value || String(new Date().getFullYear());
  annualYearSel.innerHTML = "";
  const thisYear = String(new Date().getFullYear());
  const allYears = [...new Set([thisYear, ...years])].sort().reverse();
  allYears.forEach(y => {
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = y;
    if (y === cur) opt.selected = true;
    annualYearSel.appendChild(opt);
  });
}

// ── Onboarding ────────────────────────────────────────────────────────────────
function showOnboarding(): void {
  const el = $<HTMLDivElement>("onboarding");
  if (!el) return;
  el.classList.remove("hidden");
}
function dismissOnboarding(): void {
  save(OK, true);
  const el = $<HTMLDivElement>("onboarding");
  if (el) el.classList.add("hidden");
}

// ── Currency ──────────────────────────────────────────────────────────────────
const CURRENCIES: CurrencyConfig[] = [
  { symbol: "₱", code: "PHP", rate: 1 },
  { symbol: "$", code: "USD", rate: 0.017 },
  { symbol: "€", code: "EUR", rate: 0.016 },
  { symbol: "£", code: "GBP", rate: 0.014 },
  { symbol: "¥", code: "JPY", rate: 2.6 },
  { symbol: "₩", code: "KRW", rate: 23.5 },
  { symbol: "SGD", code: "SGD", rate: 0.023 },
  { symbol: "AED", code: "AED", rate: 0.063 },
  { symbol: "SAR", code: "SAR", rate: 0.064 },
];

function initCurrencySelect(): void {
  currencySelect.innerHTML = CURRENCIES.map(c =>
    `<option value="${c.code}" ${c.code === currency.code ? "selected" : ""}>${c.code} (${c.symbol})</option>`
  ).join("");
}

// ── Bulk Actions ──────────────────────────────────────────────────────────────
function updateBulkBar(): void {
  if (selectedIds.size > 0) {
    bulkBar.classList.remove("hidden");
    bulkCount.textContent = `${selectedIds.size} selected`;
  } else {
    bulkBar.classList.add("hidden");
  }
}

// ── Weekly Summary ────────────────────────────────────────────────────────────
function renderWeeklySummary(): void {
  const el = $<HTMLDivElement>("weekly-summary");
  const now = new Date();
  const weeks: { label: string; inc: number; exp: number }[] = [];

  for (let w = 3; w >= 0; w--) {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() - w * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const txs = scopedTx().filter(t => {
      const d = new Date(t.date + "T00:00:00");
      return d >= start && d <= end;
    });
    const inc = totalIncome(txs);
    const exp = totalExpense(txs);
    const label = w === 0 ? "This week"
      : w === 1 ? "Last week"
      : `${start.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`;
    weeks.push({ label, inc, exp });
  }

  el.innerHTML = `<div class="weekly-grid">
    ${weeks.map(w => `
      <div class="weekly-item">
        <span class="weekly-label">${w.label}</span>
        <div class="weekly-bars">
          <div class="weekly-bar-row">
            <span class="weekly-type inc">Income</span>
            <div class="weekly-bar-bg"><div class="weekly-bar-fill inc" style="width:${weeks[3]?.inc ? Math.round(w.inc/Math.max(...weeks.map(x=>x.inc),1)*100) : 0}%"></div></div>
            <span class="weekly-val inc">+${peso(w.inc)}</span>
          </div>
          <div class="weekly-bar-row">
            <span class="weekly-type exp">Expense</span>
            <div class="weekly-bar-bg"><div class="weekly-bar-fill exp" style="width:${Math.round(w.exp/Math.max(...weeks.map(x=>x.exp),1)*100)}%"></div></div>
            <span class="weekly-val exp">-${peso(w.exp)}</span>
          </div>
        </div>
      </div>`).join("")}
  </div>`;
}

// ── Spending Heatmap ──────────────────────────────────────────────────────────
function renderHeatmap(): void {
  const el = $<HTMLDivElement>("heatmap");
  const today = new Date();
  const days: { date: string; amount: number }[] = [];

  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const amount = scopedTx()
      .filter(t => t.type === "expense" && t.date === dateStr)
      .reduce((s, t) => s + t.amount, 0);
    days.push({ date: dateStr, amount });
  }

  const maxAmt = Math.max(...days.map(d => d.amount), 1);
  const dayNames = ["S","M","T","W","T","F","S"];
  const startDow = new Date(days[0].date + "T00:00:00").getDay();

  let html = `<div class="heatmap-wrap">
    <div class="heatmap-days">${dayNames.map(d => `<span>${d}</span>`).join("")}</div>
    <div class="heatmap-grid" style="grid-template-rows: repeat(7, 1fr)">
      ${Array(startDow).fill('<div class="hm-cell empty"></div>').join("")}
      ${days.map(d => {
        const pct = d.amount / maxAmt;
        const intensity = pct === 0 ? 0 : pct < 0.25 ? 1 : pct < 0.5 ? 2 : pct < 0.75 ? 3 : 4;
        return `<div class="hm-cell level-${intensity}" title="${d.date}: ${d.amount > 0 ? peso(d.amount) : "No spending"}"></div>`;
      }).join("")}
    </div>
    <div class="heatmap-legend">
      <span>Less</span>
      <div class="hm-cell level-0"></div>
      <div class="hm-cell level-1"></div>
      <div class="hm-cell level-2"></div>
      <div class="hm-cell level-3"></div>
      <div class="hm-cell level-4"></div>
      <span>More</span>
    </div>
  </div>`;

  el.innerHTML = html;
}

// ── Push Notifications ────────────────────────────────────────────────────────
async function requestNotifications(): Promise<void> {
  if (!("Notification" in window)) { toast("Notifications not supported", "error"); return; }
  const perm = await Notification.requestPermission();
  if (perm === "granted") {
    notifBtn.textContent = "🔔";
    notifBtn.style.color = "var(--income)";
    save("ft_notif", true);
    toast("Notifications enabled! You'll be reminded of recurring bills.");
    scheduleNotifications();
  } else {
    toast("Notification permission denied", "error");
  }
}

function scheduleNotifications(): void {
  if (!("serviceWorker" in navigator) || Notification.permission !== "granted") return;
  const recurring = transactions.filter(t => t.recurring && t.type === "expense");
  const unique = [...new Map(recurring.map(t => [`${t.desc}-${t.amount}`, t])).values()];
  if (!unique.length) return;

  const now = new Date();

  unique.forEach(t => {
    const txDay = parseInt(t.date.split("-")[2]);
    const daysUntil = txDay - now.getDate();
    if (daysUntil === 1 || daysUntil === 3) {
      new Notification("💰 Bill Reminder", {
        body: `${t.desc} (${peso(t.amount)}) is due in ${daysUntil} day${daysUntil > 1 ? "s" : ""}`,
        icon: "/icon.svg",
        tag: `bill-${t.id}`
      });
    }
  });
}

// ── PWA Install ───────────────────────────────────────────────────────────────
let deferredInstallPrompt: Event | null = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.classList.remove("hidden");
});

window.addEventListener("appinstalled", () => {
  installBtn.classList.add("hidden");
  deferredInstallPrompt = null;
  toast("App installed successfully! 📲");
});

// ── Register Service Worker ───────────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

/* 這個檔案負責讀取、儲存支出資料，並更新畫面上的清單。 */

// 使用固定的 localStorage 名稱，讓重新開啟頁面時能找到先前資料。
const STORAGE_KEY = "simple-expense-tracker-expenses";

// 取得頁面上的表單與清單元素，後續用來讀取輸入和更新畫面。
const form = document.querySelector("#expense-form");
const amountInput = document.querySelector("#amount");
const categoryInput = document.querySelector("#category");
const dateInput = document.querySelector("#date");
const expenseList = document.querySelector("#expense-list");
const emptyState = document.querySelector("#empty-state");
const expenseCount = document.querySelector("#expense-count");
const expenseTotal = document.querySelector("#expense-total");
const monthFilter = document.querySelector("#month-filter");
const categoryFilter = document.querySelector("#category-filter");
const exportButton = document.querySelector("#export-button");
const importButton = document.querySelector("#import-button");
const importFile = document.querySelector("#import-file");
const backupMessage = document.querySelector("#backup-message");
const formMessage = document.querySelector("#form-message");
const categoryChart = document.querySelector("#category-chart");
const chartEmpty = document.querySelector("#chart-empty");

// 從瀏覽器讀取已儲存的支出；若資料不存在或格式有誤，就從空清單開始。
function loadExpenses() {
  try {
    const savedExpenses = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(savedExpenses)) return [];

    // 舊版紀錄可能沒有 id，或曾出現重複 id；載入時補成唯一識別碼並保留其他欄位。
    const usedIds = new Set();
    let needsSave = false;
    const migratedExpenses = savedExpenses.map((expense) => {
      const hasUniqueId = typeof expense.id === "string" && expense.id && !usedIds.has(expense.id);
      const id = hasUniqueId ? expense.id : createExpenseId();
      usedIds.add(id);
      if (!hasUniqueId) needsSave = true;
      return { ...expense, id };
    });
    if (needsSave) localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedExpenses));
    return migratedExpenses;
  } catch {
    return [];
  }
}

// 建立不依賴外部函式庫的唯一紀錄 id。
function createExpenseId() {
  return globalThis.crypto?.randomUUID?.() || `expense-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let expenses = loadExpenses();

// 把支出清單存回瀏覽器，不需要伺服器或網路連線。
function saveExpenses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

// 將金額格式化為新臺幣顯示。
function formatCurrency(amount) {
  // 顯示千分位，整數不加小數；有小數時最多保留兩位。
  return `$${new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

// 將 YYYY-MM-DD 日期轉成較容易閱讀的年、月、日格式。
function formatDate(dateString) {
  const [year, month, day] = dateString.split("-");
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

// 重新繪製支出清單、筆數與總金額。
function renderExpenses() {
  expenseList.replaceChildren();
  updateFilterOptions();
  const visibleExpenses = getFilteredExpenses();
  emptyState.hidden = visibleExpenses.length > 0;
  expenseCount.textContent = `目前共 ${visibleExpenses.length} 筆`;

  const total = visibleExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  expenseTotal.textContent = formatCurrency(total);
  renderCategoryChart(visibleExpenses);

  // 先按日期由新到舊排列；日期相同時，新新增的項目排前面。
  const sortedExpenses = [...visibleExpenses].sort((a, b) =>
    b.date.localeCompare(a.date) || b.createdAt - a.createdAt
  );

  for (const expense of sortedExpenses) {
    const item = document.createElement("li");
    item.className = "expense-item";

    const info = document.createElement("div");
    info.className = "expense-info";

    const mark = document.createElement("span");
    mark.className = "category-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "•";

    const description = document.createElement("div");
    const category = document.createElement("div");
    category.className = "expense-category";
    category.textContent = expense.category;

    const date = document.createElement("div");
    date.className = "expense-date";
    date.textContent = formatDate(expense.date);

    description.append(category, date);
    info.append(mark, description);

    const amount = document.createElement("span");
    amount.className = "expense-amount";
    amount.textContent = `− ${formatCurrency(expense.amount)}`;

    // 刪除按鈕記錄該筆支出的 id，刪除時不依賴清單顯示順序。
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "刪除";
    deleteButton.setAttribute("aria-label", `刪除 ${expense.category} ${formatDate(expense.date)} 支出`);
    deleteButton.addEventListener("click", () => deleteExpense(expense.id));

    const actions = document.createElement("div");
    actions.className = "expense-actions";
    actions.append(amount, deleteButton);
    item.append(info, actions);
    expenseList.append(item);
  }
}

// 依目前顯示的紀錄加總各分類，繪製不需外部函式庫的 CSS 長條圖與文字圖例。
function renderCategoryChart(visibleExpenses) {
  categoryChart.replaceChildren();
  const totalsByCategory = new Map();
  for (const expense of visibleExpenses) {
    totalsByCategory.set(expense.category, (totalsByCategory.get(expense.category) || 0) + expense.amount);
  }
  const totals = [...totalsByCategory.entries()].sort((a, b) => b[1] - a[1]);
  chartEmpty.hidden = totals.length > 0;
  if (!totals.length) return;

  const maxTotal = Math.max(...totals.map(([, amount]) => amount));
  const colors = ["#5b8d69", "#d39a52", "#718ab3", "#c97869", "#8b70a5", "#5c9a9a", "#a5a64b"];
  totals.forEach(([name, amount], index) => {
    const row = document.createElement("div");
    row.className = "chart-row";
    const label = document.createElement("span");
    label.className = "chart-label";
    label.textContent = name;
    const track = document.createElement("div");
    track.className = "chart-track";
    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.style.width = `${Math.max(4, (amount / maxTotal) * 100)}%`;
    bar.style.backgroundColor = colors[index % colors.length];
    track.append(bar);
    const value = document.createElement("span");
    value.className = "chart-value";
    value.textContent = formatCurrency(amount);
    row.append(label, track, value);
    categoryChart.append(row);
  });
}

// 依所有紀錄更新月份與分類選項，並保留仍有效的目前選擇。
function updateFilterOptions() {
  const selectedMonth = monthFilter.value;
  const months = [...new Set(expenses.map((expense) => expense.date.slice(0, 7)))].sort().reverse();
  monthFilter.replaceChildren(new Option("全部月份", ""));
  for (const month of months) monthFilter.add(new Option(month, month));
  monthFilter.value = months.includes(selectedMonth) ? selectedMonth : "";

  const selectedCategory = categoryFilter.value;
  const categories = [...new Set(expenses.map((expense) => expense.category))].sort((a, b) => a.localeCompare(b, "zh-TW"));
  categoryFilter.replaceChildren(new Option("全部分類", ""));
  for (const category of categories) categoryFilter.add(new Option(category, category));
  categoryFilter.value = categories.includes(selectedCategory) ? selectedCategory : "";
}

// 依月份和分類同時篩選；只回傳畫面使用的陣列，不修改原始支出陣列。
function getFilteredExpenses() {
  return expenses.filter((expense) =>
    (!monthFilter.value || expense.date.slice(0, 7) === monthFilter.value) &&
    (!categoryFilter.value || expense.category === categoryFilter.value)
  );
}

// 先取得使用者確認，再依唯一 id 刪除並同步儲存及重繪清單。
function deleteExpense(id) {
  const expense = expenses.find((item) => item.id === id);
  if (!expense || !window.confirm(`確定要刪除「${expense.category}」這筆支出嗎？`)) return;
  expenses = expenses.filter((item) => item.id !== id);
  saveExpenses();
  renderExpenses();
}

// 將全部支出（不受篩選影響）製成 JSON 檔供使用者下載。
function exportExpenses() {
  const json = JSON.stringify(expenses, null, 2);
  const fileUrl = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  const today = new Date().toLocaleDateString("en-CA");
  link.href = fileUrl;
  link.download = `記帳備份-${today}.json`;
  link.click();
  URL.revokeObjectURL(fileUrl);
  backupMessage.textContent = `已匯出全部 ${expenses.length} 筆紀錄。`;
}

// 驗證日期字串確實是有效的 YYYY-MM-DD 日期。
function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// 檢查備份陣列中的每筆資料，拒絕錯誤金額、空分類或無效日期。
function validateImportedExpenses(data) {
  if (!Array.isArray(data)) throw new Error("檔案內容必須是 JSON 陣列。");
  data.forEach((expense, index) => {
    const row = index + 1;
    if (!expense || typeof expense !== "object" || Array.isArray(expense)) {
      throw new Error(`第 ${row} 筆不是有效的紀錄物件。`);
    }
    if (typeof expense.amount !== "number" || !Number.isFinite(expense.amount) || expense.amount <= 0) {
      throw new Error(`第 ${row} 筆金額必須是大於 0 的數字。`);
    }
    if (typeof expense.category !== "string" || !expense.category.trim()) {
      throw new Error(`第 ${row} 筆分類必須是非空白文字。`);
    }
    if (!isValidDateString(expense.date)) throw new Error(`第 ${row} 筆日期格式錯誤，請使用 YYYY-MM-DD。`);
  });
  return data;
}

// 匯入前詢問覆蓋或合併，合併時以 id 去重並為沒有 id 的資料補上新 id。
function applyImportedExpenses(importedExpenses, mode) {
  const usedIds = new Set();
  const normalized = importedExpenses.map((expense) => {
    let id = typeof expense.id === "string" && expense.id.trim() ? expense.id : createExpenseId();
    if (usedIds.has(id)) id = createExpenseId();
    usedIds.add(id);
    return { ...expense, id, category: expense.category.trim(), createdAt: Number.isFinite(expense.createdAt) ? expense.createdAt : Date.now() };
  });

  if (mode === "overwrite") {
    expenses = normalized;
    saveExpenses();
    renderExpenses();
    return normalized.length;
  }

  const existingIds = new Set(expenses.map((expense) => expense.id));
  const additions = normalized.filter((expense) => !existingIds.has(expense.id));
  expenses = [...expenses, ...additions];
  saveExpenses();
  renderExpenses();
  return additions.length;
}

// 把今天填入日期欄位，使用者仍可自行改成其他日期。
dateInput.value = new Date().toLocaleDateString("en-CA");

// 收到表單送出事件時，檢查輸入內容並新增一筆支出。
form.addEventListener("submit", (event) => {
  event.preventDefault();

  const amount = Number(amountInput.value);
  const category = categoryInput.value.trim();
  const date = dateInput.value;

  // 逐一驗證金額、分類與日期，失敗時明確提示且不新增資料。
  if (!amountInput.value.trim() || !Number.isFinite(amount) || amount <= 0) {
    formMessage.textContent = "請輸入大於 0 的有效金額。";
    amountInput.focus();
    return;
  }
  if (!category) {
    formMessage.textContent = "請選擇分類。";
    categoryInput.focus();
    return;
  }
  if (!isValidDateString(date)) {
    formMessage.textContent = "請填寫有效日期。";
    dateInput.focus();
    return;
  }
  formMessage.textContent = "";

  expenses.push({ id: createExpenseId(), amount, category, date, createdAt: Date.now() });
  saveExpenses();
  renderExpenses();

  // 保留日期以方便連續記帳，並把焦點移回金額欄位。
  amountInput.value = "";
  categoryInput.value = "";
  amountInput.focus();
});

// 使用者修正欄位時清除上次的表單錯誤訊息。
form.addEventListener("input", () => { formMessage.textContent = ""; });
form.addEventListener("change", () => { formMessage.textContent = ""; });

// 任一篩選條件變更時，重新計算清單、總額與筆數。
monthFilter.addEventListener("change", renderExpenses);
categoryFilter.addEventListener("change", renderExpenses);

// 由按鈕觸發下載，或開啟 JSON 檔案選擇視窗。
exportButton.addEventListener("click", exportExpenses);
importButton.addEventListener("click", () => importFile.click());

// 讀取並驗證所選備份；任何失敗都只顯示錯誤，不寫入支出資料。
importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  backupMessage.textContent = "";
  try {
    const parsed = JSON.parse(await file.text());
    const validExpenses = validateImportedExpenses(parsed);
    const choice = window.prompt("請選擇匯入方式：輸入 1 覆蓋現有資料，輸入 2 合併資料（依 id 避免重複）。");
    if (choice !== "1" && choice !== "2") {
      backupMessage.textContent = "已取消匯入，資料未變更。";
      return;
    }
    const count = applyImportedExpenses(validExpenses, choice === "1" ? "overwrite" : "merge");
    backupMessage.textContent = `匯入完成，本次${choice === "1" ? "載入" : "新增"} ${count} 筆紀錄。`;
  } catch (error) {
    backupMessage.textContent = `匯入失敗：${error.message || "無法讀取檔案。"}`;
  } finally {
    importFile.value = "";
  }
});

// 頁面初次開啟時，顯示已經儲存的支出資料。
renderExpenses();

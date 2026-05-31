// Simulateur PEA + Compte Titres - calcul année par année + graphique

const PEA_CONTRIBUTION_CAP_EUR = 150_000;
const PEA_TAX_RATE = 0.172; // Prélèvements sociaux (hypothèse simplifiée)
const CTO_TAX_RATE = 0.3; // Flat tax (hypothèse simplifiée)
const MAX_RETIREMENT_YEARS = 50;

let chart = null;

const STORAGE_KEY = "pea_simulator_v2";

function clampNumber(value, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.min(max, Math.max(min, numberValue));
}

function formatMoney(amount) {
  return Math.round(amount).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function readInputs() {
  const useAvailableSavings =
    document.getElementById("use-available-savings")?.checked ?? false;

  const initial = clampNumber(document.getElementById("initial").value, {
    min: 0,
  });
  const annualContributionManual = clampNumber(
    document.getElementById("annual-contribution").value,
    { min: 0 },
  );
  const contributingYears = Math.floor(
    clampNumber(document.getElementById("contributing-years").value, { min: 0 }),
  );
  const startingAge = Math.floor(
    clampNumber(document.getElementById("starting-age").value, { min: 0 }),
  );

  const peaWithdrawalAmount = clampNumber(
    document.getElementById("pea-withdrawal").value,
    { min: 0 },
  );
  const ctoWithdrawalAmount = clampNumber(
    document.getElementById("ct-withdrawal").value,
    { min: 0 },
  );

  const peaRatePercent = clampNumber(document.getElementById("return").value, {
    min: -50,
    max: 100,
  });
  const ctoRatePercent = clampNumber(document.getElementById("ct-return").value, {
    min: -50,
    max: 100,
  });

  const grossSalary = clampNumber(
    document.getElementById("gross-salary")?.value ?? 0,
    { min: 0 },
  );
  const netRatePercent = clampNumber(
    document.getElementById("net-rate")?.value ?? 70,
    { min: 0, max: 100 },
  );
  const netIncome = grossSalary * (netRatePercent / 100);
  const expensesTotal = getExpensesTotal();
  const availableSavings = netIncome - expensesTotal;

  const annualContribution = useAvailableSavings
    ? Math.max(0, availableSavings)
    : annualContributionManual;

  return {
    initial,
    annualContribution,
    contributingYears,
    startingAge,
    peaWithdrawalAmount,
    ctoWithdrawalAmount,
    peaRate: peaRatePercent / 100,
    ctoRate: ctoRatePercent / 100,
    grossSalary,
    netRatePercent,
    netIncome,
    expensesTotal,
    availableSavings,
    useAvailableSavings,
  };
}

function allocateToPeaAndCto({ desiredContribution, peaContributed }) {
  const remainingPeaCap = Math.max(0, PEA_CONTRIBUTION_CAP_EUR - peaContributed);
  const toPea = Math.min(desiredContribution, remainingPeaCap);
  const toCto = Math.max(0, desiredContribution - toPea);
  return { toPea, toCto, remainingPeaCap };
}

function computeTaxesOnWithdrawal({ withdrawalGross, balanceBefore, contributed, taxRate }) {
  if (withdrawalGross <= 0 || balanceBefore <= 0) return { taxes: 0 };

  const gains = Math.max(0, balanceBefore - contributed);
  if (gains <= 0) return { taxes: 0 };

  const gainsShare = gains / balanceBefore;
  const gainsPartWithdrawn = withdrawalGross * gainsShare;
  const taxes = gainsPartWithdrawn * taxRate;
  return { taxes };
}

function simulate({
  initial,
  annualContribution,
  contributingYears,
  startingAge,
  peaWithdrawalAmount,
  ctoWithdrawalAmount,
  peaRate,
  ctoRate,
}) {
  const retirementAge = startingAge + contributingYears;

  let age = startingAge;

  let peaBalance = 0;
  let peaContributed = 0;
  let ctoBalance = 0;
  let ctoContributed = 0;

  let totalPeaTaxes = 0;
  let totalCtoTaxes = 0;

  const yearlyData = [];

  let capWarning = "";
  let capReachedAge = null;

  // Versement initial : PEA jusqu'au plafond, surplus vers CTO
  {
    const allocation = allocateToPeaAndCto({
      desiredContribution: initial,
      peaContributed,
    });

    peaBalance += allocation.toPea;
    peaContributed += allocation.toPea;

    ctoBalance += allocation.toCto;
    ctoContributed += allocation.toCto;

    if (allocation.toCto > 0) {
      capWarning = `Versement initial > plafond PEA : ${formatMoney(
        allocation.toCto,
      )} € versés sur le CTO.`;
      capReachedAge = startingAge;
    }
  }

  // Phase 1 : accumulation (aucune fiscalité appliquée ici)
  while (age < retirementAge) {
    const peaGain = peaBalance * peaRate;
    const ctoGain = ctoBalance * ctoRate;

    const allocation = allocateToPeaAndCto({
      desiredContribution: annualContribution,
      peaContributed,
    });

    if (allocation.toCto > 0 && capReachedAge === null) {
      capReachedAge = age + 1;
      capWarning = `Plafond PEA atteint à ${capReachedAge} ans : ${formatMoney(
        allocation.toCto,
      )} € / an versés sur le CTO.`;
    }

    peaBalance = peaBalance + peaGain + allocation.toPea;
    peaContributed += allocation.toPea;

    ctoBalance = ctoBalance + ctoGain + allocation.toCto;
    ctoContributed += allocation.toCto;

    age += 1;

    yearlyData.push({
      age,
      phase: "Accumulation",
      balance: peaBalance,
      contributed: peaContributed,
      actualContribution: allocation.toPea,
      ctBalance: ctoBalance,
      ctContributed: ctoContributed,
      ctContribution: allocation.toCto,
      peaWithdrawal: 0,
      ctWithdrawal: 0,
      peaTaxesPaid: 0,
      ctTaxesPaid: 0,
      totalPeaTaxes,
      totalCtoTaxes,
    });
  }

  const valueAtRetirement = peaBalance + ctoBalance;

  // Phase 2 : retraite (retraits + fiscalité simplifiée au retrait)
  let retirementYears = 0;
  while (peaBalance + ctoBalance > 0 && retirementYears < MAX_RETIREMENT_YEARS) {
    const peaGain = peaBalance * peaRate;
    const ctoGain = ctoBalance * ctoRate;

    peaBalance += peaGain;
    ctoBalance += ctoGain;

    const peaWithdrawal = Math.min(peaWithdrawalAmount, peaBalance);
    const peaTaxes = computeTaxesOnWithdrawal({
      withdrawalGross: peaWithdrawal,
      balanceBefore: peaBalance,
      contributed: peaContributed,
      taxRate: PEA_TAX_RATE,
    }).taxes;
    peaBalance -= peaWithdrawal;
    totalPeaTaxes += peaTaxes;

    const ctWithdrawal = Math.min(ctoWithdrawalAmount, ctoBalance);
    const ctTaxes = computeTaxesOnWithdrawal({
      withdrawalGross: ctWithdrawal,
      balanceBefore: ctoBalance,
      contributed: ctoContributed,
      taxRate: CTO_TAX_RATE,
    }).taxes;
    ctoBalance -= ctWithdrawal;
    totalCtoTaxes += ctTaxes;

    age += 1;
    retirementYears += 1;

    yearlyData.push({
      age,
      phase: "Retraite",
      balance: Math.max(0, peaBalance),
      contributed: peaContributed,
      actualContribution: 0,
      ctBalance: Math.max(0, ctoBalance),
      ctContributed: ctoContributed,
      ctContribution: 0,
      peaWithdrawal,
      ctWithdrawal,
      peaTaxesPaid: peaTaxes,
      ctTaxesPaid: ctTaxes,
      totalPeaTaxes,
      totalCtoTaxes,
    });
  }

  return {
    retirementAge,
    retirementYears,
    valueAtRetirement,
    peaValueAtRetirement: yearlyData.find((d) => d.age === retirementAge)?.balance ?? peaBalance,
    ctoValueAtRetirement:
      yearlyData.find((d) => d.age === retirementAge)?.ctBalance ?? ctoBalance,
    peaContributed,
    ctoContributed,
    totalTaxes: totalPeaTaxes + totalCtoTaxes,
    totalPeaTaxes,
    totalCtoTaxes,
    capWarning,
    capReachedAge,
    yearlyData,
  };
}

function setResult(summary) {
  const lines = [];
  lines.push(
    `${formatMoney(summary.valueAtRetirement)} € de patrimoine financier à ${summary.retirementAge} ans`,
  );
  lines.push(`PEA : ${formatMoney(summary.peaValueAtRetirement)} € (brut)`);
  lines.push(`CTO : ${formatMoney(summary.ctoValueAtRetirement)} € (brut)`);
  lines.push(
    `Versements PEA : ${formatMoney(summary.peaContributed)} € / ${formatMoney(
      PEA_CONTRIBUTION_CAP_EUR,
    )} €`,
  );
  if (summary.ctoContributed > 0) {
    lines.push(`Versements CTO : ${formatMoney(summary.ctoContributed)} €`);
  }
  if (summary.totalTaxes > 0) {
    lines.push(`Impôts payés sur les plus-values retirées : ${formatMoney(summary.totalTaxes)} €`);
    lines.push(`  - PEA : ${formatMoney(summary.totalPeaTaxes)} € (17,2%)`);
    lines.push(`  - CTO : ${formatMoney(summary.totalCtoTaxes)} € (30%)`);
  }
  lines.push(`Soit ${summary.retirementYears} ans de retraite simulés`);

  document.getElementById("result").textContent = lines.join("\n");

  const capWarningEl = document.getElementById("cap-warning");
  if (capWarningEl) {
    capWarningEl.textContent = summary.capWarning || "";
    capWarningEl.style.display = summary.capWarning ? "block" : "none";
  }
}

function setIncomeSummary({ netIncome, expensesTotal, availableSavings }) {
  const netIncomeEl = document.getElementById("net-income");
  const expensesTotalEl = document.getElementById("expenses-total");
  const availableSavingsEl = document.getElementById("available-savings");

  if (netIncomeEl) netIncomeEl.textContent = `${formatMoney(netIncome)} €`;
  if (expensesTotalEl)
    expensesTotalEl.textContent = `${formatMoney(expensesTotal)} €`;

  if (availableSavingsEl) {
    availableSavingsEl.textContent = `${formatMoney(availableSavings)} €`;
    availableSavingsEl.style.color =
      availableSavings >= 0 ? "" : "var(--error)";
  }
}

function displayChart(yearlyData) {
  const ctx = document.getElementById("chart").getContext("2d");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: yearlyData.map((d) => `${d.age} ans`),
      datasets: [
        {
          label: "Total (PEA + CTO)",
          data: yearlyData.map((d) => d.balance + d.ctBalance),
          borderColor: "#60a5fa",
          backgroundColor: "rgba(96, 165, 250, 0.12)",
          fill: true,
          tension: 0.12,
        },
        {
          label: "PEA",
          data: yearlyData.map((d) => d.balance),
          borderColor: "#34d399",
          backgroundColor: "transparent",
          tension: 0.12,
        },
        {
          label: "CTO",
          data: yearlyData.map((d) => d.ctBalance),
          borderColor: "#fbbf24",
          backgroundColor: "transparent",
          tension: 0.12,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#f9fafb" } },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label} : ${formatMoney(context.raw)} €`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: "#f9fafb",
            callback: (value) => `${formatMoney(value)} €`,
          },
          grid: { color: "rgba(255, 255, 255, 0.10)" },
        },
        x: {
          ticks: { color: "#f9fafb" },
          grid: { color: "rgba(255, 255, 255, 0.10)" },
        },
      },
    },
  });
}

function displayPEATable(yearlyData) {
  const tbody = document.getElementById("pea-data");
  tbody.innerHTML = "";

  yearlyData.forEach((data, index) => {
    const row = document.createElement("tr");

    let yearlyGain = 0;
    if (index === 0) {
      yearlyGain = data.balance - data.contributed;
    } else {
      const previous = yearlyData[index - 1];
      const balanceChange = data.balance - previous.balance;
      const contributedChange = data.contributed - previous.contributed;
      yearlyGain = balanceChange - contributedChange;
    }
    const totalGain = data.balance - data.contributed;

    const phaseClass =
      data.phase === "Accumulation" ? "phase-accumulation" : "phase-retirement";

    row.innerHTML = `
      <td>${data.age} ans</td>
      <td><span class="${phaseClass}">${data.phase}</span></td>
      <td>${formatMoney(data.balance)} €</td>
      <td>${data.actualContribution > 0 ? `${formatMoney(data.actualContribution)} €` : "-"}</td>
      <td>${formatMoney(data.contributed)} €</td>
      <td class="${yearlyGain >= 0 ? "text-success" : "text-danger"}">${yearlyGain >= 0 ? "+" : ""}${formatMoney(yearlyGain)} €</td>
      <td class="${totalGain >= 0 ? "text-success" : "text-danger"}">${totalGain >= 0 ? "+" : ""}${formatMoney(totalGain)} €</td>
    `;

    tbody.appendChild(row);
  });
}

function displayCTOTable(yearlyData) {
  const tbody = document.getElementById("cto-data");
  tbody.innerHTML = "";

  yearlyData.forEach((data, index) => {
    const row = document.createElement("tr");

    let yearlyGain = 0;
    if (index === 0) {
      yearlyGain = data.ctBalance - data.ctContributed;
    } else {
      const previous = yearlyData[index - 1];
      const balanceChange = data.ctBalance - previous.ctBalance;
      const contributedChange = data.ctContributed - previous.ctContributed;
      yearlyGain = balanceChange - contributedChange;
    }
    const totalGain = data.ctBalance - data.ctContributed;

    const phaseClass =
      data.phase === "Accumulation" ? "phase-accumulation" : "phase-retirement";

    row.innerHTML = `
      <td>${data.age} ans</td>
      <td><span class="${phaseClass}">${data.phase}</span></td>
      <td>${data.ctBalance > 0 ? `${formatMoney(data.ctBalance)} €` : "-"}</td>
      <td>${data.ctContribution > 0 ? `${formatMoney(data.ctContribution)} €` : "-"}</td>
      <td>${data.ctContributed > 0 ? `${formatMoney(data.ctContributed)} €` : "-"}</td>
      <td class="${yearlyGain >= 0 ? "text-success" : "text-danger"}">${yearlyGain >= 0 ? "+" : ""}${formatMoney(yearlyGain)} €</td>
      <td class="${totalGain >= 0 ? "text-success" : "text-danger"}">${totalGain >= 0 ? "+" : ""}${formatMoney(totalGain)} €</td>
    `;

    tbody.appendChild(row);
  });
}

function displayWithdrawalsTable(yearlyData) {
  const tbody = document.getElementById("withdrawals-data");
  tbody.innerHTML = "";

  yearlyData.forEach((data) => {
    if (
      data.phase !== "Retraite" ||
      (data.peaWithdrawal <= 0 && data.ctWithdrawal <= 0)
    ) {
      return;
    }

    const row = document.createElement("tr");

    const peaNet = data.peaWithdrawal - (data.peaTaxesPaid || 0);
    const ctoNet = data.ctWithdrawal - (data.ctTaxesPaid || 0);
    const totalNet = peaNet + ctoNet;
    const totalTaxes = (data.peaTaxesPaid || 0) + (data.ctTaxesPaid || 0);

    row.innerHTML = `
      <td>${data.age} ans</td>
      <td>${data.peaWithdrawal > 0 ? `${formatMoney(peaNet)} €` : "-"}</td>
      <td>${data.peaTaxesPaid > 0 ? `${formatMoney(data.peaTaxesPaid)} €` : "-"}</td>
      <td>${data.ctWithdrawal > 0 ? `${formatMoney(ctoNet)} €` : "-"}</td>
      <td>${data.ctTaxesPaid > 0 ? `${formatMoney(data.ctTaxesPaid)} €` : "-"}</td>
      <td class="text-primary font-weight-bold">${formatMoney(totalNet)} €</td>
      <td>${formatMoney(totalTaxes)} €</td>
    `;

    tbody.appendChild(row);
  });
}

function calculateAndRender() {
  const inputs = readInputs();
  const simulation = simulate(inputs);

  setIncomeSummary(inputs);
  setResult(simulation);
  displayChart(simulation.yearlyData);
  displayPEATable(simulation.yearlyData);
  displayCTOTable(simulation.yearlyData);
  displayWithdrawalsTable(simulation.yearlyData);

  syncAnnualContributionUI(inputs);
  saveState();
}

function getExpensesTotal() {
  const rows = document.querySelectorAll("[data-expense-row]");
  let total = 0;
  rows.forEach((row) => {
    const amountInput = row.querySelector("[data-expense-amount]");
    total += clampNumber(amountInput?.value ?? 0, { min: 0 });
  });
  return total;
}

function createExpenseRow({ label = "", amount = 0 } = {}) {
  const row = document.createElement("div");
  row.className = "expense-row";
  row.setAttribute("data-expense-row", "1");

  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.placeholder = "Ex : Loyer, courses, transports…";
  labelInput.value = label;
  labelInput.setAttribute("data-expense-label", "1");

  const amountInput = document.createElement("input");
  amountInput.type = "number";
  amountInput.min = "0";
  amountInput.step = "100";
  amountInput.placeholder = "Montant €/an";
  amountInput.value = String(amount || "");
  amountInput.setAttribute("data-expense-amount", "1");

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "btn btn-danger btn-icon";
  removeButton.setAttribute("aria-label", "Supprimer la dépense");
  removeButton.textContent = "×";

  const onAnyChange = () => calculateAndRender();
  labelInput.addEventListener("input", onAnyChange);
  amountInput.addEventListener("input", onAnyChange);
  removeButton.addEventListener("click", () => {
    row.remove();
    calculateAndRender();
  });

  row.appendChild(labelInput);
  row.appendChild(amountInput);
  row.appendChild(removeButton);
  return row;
}

function ensureAtLeastOneExpenseRow() {
  const container = document.getElementById("expenses-list");
  if (!container) return;
  if (container.querySelectorAll("[data-expense-row]").length > 0) return;
  container.appendChild(createExpenseRow({ label: "Dépenses", amount: 0 }));
}

function syncAnnualContributionUI({ useAvailableSavings, availableSavings }) {
  const annualContributionEl = document.getElementById("annual-contribution");
  if (!annualContributionEl) return;

  annualContributionEl.disabled = useAvailableSavings;
  annualContributionEl.classList.toggle("is-disabled", useAvailableSavings);

  if (useAvailableSavings) {
    annualContributionEl.value = String(Math.max(0, Math.round(availableSavings)));
  }
}

function saveState() {
  const state = {
    theme: document.documentElement.getAttribute("data-theme") || "dark",
    values: {
      initial: document.getElementById("initial")?.value ?? "",
      annualContribution: document.getElementById("annual-contribution")?.value ?? "",
      contributingYears: document.getElementById("contributing-years")?.value ?? "",
      startingAge: document.getElementById("starting-age")?.value ?? "",
      peaReturn: document.getElementById("return")?.value ?? "",
      peaWithdrawal: document.getElementById("pea-withdrawal")?.value ?? "",
      ctoWithdrawal: document.getElementById("ct-withdrawal")?.value ?? "",
      ctoReturn: document.getElementById("ct-return")?.value ?? "7",
      grossSalary: document.getElementById("gross-salary")?.value ?? "",
      netRate: document.getElementById("net-rate")?.value ?? "70",
      useAvailableSavings: document.getElementById("use-available-savings")?.checked ?? false,
    },
    expenses: Array.from(document.querySelectorAll("[data-expense-row]")).map((row) => ({
      label: row.querySelector("[data-expense-label]")?.value ?? "",
      amount: row.querySelector("[data-expense-amount]")?.value ?? "",
    })),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);

    if (state?.values) {
      const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? "";
      };

      setValue("initial", state.values.initial);
      setValue("annual-contribution", state.values.annualContribution);
      setValue("contributing-years", state.values.contributingYears);
      setValue("starting-age", state.values.startingAge);
      setValue("return", state.values.peaReturn);
      setValue("pea-withdrawal", state.values.peaWithdrawal);
      setValue("ct-withdrawal", state.values.ctoWithdrawal);
      setValue("ct-return", state.values.ctoReturn);
      setValue("gross-salary", state.values.grossSalary);
      setValue("net-rate", state.values.netRate);

      const checkbox = document.getElementById("use-available-savings");
      if (checkbox) checkbox.checked = Boolean(state.values.useAvailableSavings);
    }

    const expensesContainer = document.getElementById("expenses-list");
    if (expensesContainer) {
      expensesContainer.innerHTML = "";
      if (Array.isArray(state.expenses) && state.expenses.length > 0) {
        state.expenses.forEach((e) =>
          expensesContainer.appendChild(
            createExpenseRow({ label: e.label, amount: Number(e.amount) || 0 }),
          ),
        );
      }
    }
  } catch {
    // ignore
  }
}

document.addEventListener("DOMContentLoaded", () => {
  restoreState();

  const inputIds = [
    "initial",
    "annual-contribution",
    "contributing-years",
    "pea-withdrawal",
    "ct-withdrawal",
    "starting-age",
    "return",
    "ct-return",
    "gross-salary",
    "net-rate",
    "use-available-savings",
  ];

  inputIds.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("input", calculateAndRender);
    input.addEventListener("change", calculateAndRender);
  });

  const addExpenseButton = document.getElementById("add-expense");
  const expensesContainer = document.getElementById("expenses-list");
  if (addExpenseButton && expensesContainer) {
    addExpenseButton.addEventListener("click", () => {
      expensesContainer.appendChild(createExpenseRow());
      calculateAndRender();
    });
  }

  ensureAtLeastOneExpenseRow();
  calculateAndRender();
});

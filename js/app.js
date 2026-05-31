// Simulateur PEA + Compte Titres - calcul année par année + graphique

const PEA_CONTRIBUTION_CAP_EUR = 150_000;
const PEA_TAX_RATE = 0.172; // Prélèvements sociaux (hypothèse simplifiée)
const CTO_TAX_RATE = 0.3; // Flat tax (hypothèse simplifiée)
const MAX_RETIREMENT_YEARS = 50;

let chart = null;

const STORAGE_KEY = "pea_simulator_v2";

function roundMoney(amount) {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

function yearToMonth(amountAnnual) {
  return roundMoney((Number(amountAnnual) || 0) / 12);
}

function monthToYear(amountMonthly) {
  return roundMoney((Number(amountMonthly) || 0) * 12);
}

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
  const useAutoRetirementAge =
    document.getElementById("use-auto-retirement-age")?.checked ?? true;

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
  const retirementAgeManual = Math.floor(
    clampNumber(document.getElementById("retirement-age")?.value ?? 0, { min: 0 }),
  );
  const retirementAgeAuto = startingAge + contributingYears;
  const retirementAge = Math.max(
    startingAge,
    useAutoRetirementAge ? retirementAgeAuto : retirementAgeManual,
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
  const grossSalaryMonthly = clampNumber(
    document.getElementById("gross-salary-monthly")?.value ?? 0,
    { min: 0 },
  );
  const netRatePercent = clampNumber(
    document.getElementById("net-rate")?.value ?? 70,
    { min: 0, max: 100 },
  );
  const grossAnnual = Math.max(grossSalary, monthToYear(grossSalaryMonthly));
  const netIncome = grossAnnual * (netRatePercent / 100);
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
    retirementAge,
    useAutoRetirementAge,
    peaWithdrawalAmount,
    ctoWithdrawalAmount,
    peaRate: peaRatePercent / 100,
    ctoRate: ctoRatePercent / 100,
    grossSalary,
    grossSalaryMonthly,
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

function withdrawTotalWithOrder({
  totalAmount,
  first: { balance: firstBalance, contributed: firstContributed, taxRate: firstTaxRate },
  second: { balance: secondBalance, contributed: secondContributed, taxRate: secondTaxRate },
}) {
  const fromFirst = Math.min(totalAmount, firstBalance);
  const firstTaxes = computeTaxesOnWithdrawal({
    withdrawalGross: fromFirst,
    balanceBefore: firstBalance,
    contributed: firstContributed,
    taxRate: firstTaxRate,
  }).taxes;

  firstBalance -= fromFirst;
  const remaining = totalAmount - fromFirst;

  const fromSecond = Math.min(remaining, secondBalance);
  const secondTaxes = computeTaxesOnWithdrawal({
    withdrawalGross: fromSecond,
    balanceBefore: secondBalance,
    contributed: secondContributed,
    taxRate: secondTaxRate,
  }).taxes;
  secondBalance -= fromSecond;

  return {
    fromFirst,
    fromSecond,
    firstBalance,
    secondBalance,
    taxes: firstTaxes + secondTaxes,
    firstTaxes,
    secondTaxes,
  };
}

function simulateTotalWithdrawalStrategy({
  initial,
  annualContribution,
  contributingYears,
  startingAge,
  retirementAge,
  totalWithdrawalAmount,
  peaRate,
  ctoRate,
  strategy,
}) {
  const contributionEndAge = startingAge + contributingYears;
  const retirementStartAge = Math.max(startingAge, retirementAge);

  let age = startingAge;

  let peaBalance = 0;
  let peaContributed = 0;
  let ctoBalance = 0;
  let ctoContributed = 0;

  let totalPeaTaxes = 0;
  let totalCtoTaxes = 0;

  // Initial allocation
  {
    const allocation = allocateToPeaAndCto({ desiredContribution: initial, peaContributed });
    peaBalance += allocation.toPea;
    peaContributed += allocation.toPea;
    ctoBalance += allocation.toCto;
    ctoContributed += allocation.toCto;
  }

  // Accumulation/attente until retirement start age
  while (age < retirementStartAge) {
    const peaGain = peaBalance * peaRate;
    const ctoGain = ctoBalance * ctoRate;

    const shouldContribute = age < contributionEndAge;
    const allocation = shouldContribute
      ? allocateToPeaAndCto({ desiredContribution: annualContribution, peaContributed })
      : { toPea: 0, toCto: 0 };

    peaBalance = peaBalance + peaGain + allocation.toPea;
    peaContributed += allocation.toPea;

    ctoBalance = ctoBalance + ctoGain + allocation.toCto;
    ctoContributed += allocation.toCto;

    age += 1;
  }

  const peaAtStart = peaBalance;
  const ctoAtStart = ctoBalance;

  // Retirement years
  let retirementYears = 0;
  let firstYearSplit = { pea: 0, cto: 0 };

  while (peaBalance + ctoBalance > 0 && retirementYears < MAX_RETIREMENT_YEARS) {
    peaBalance += peaBalance * peaRate;
    ctoBalance += ctoBalance * ctoRate;

    let w;
    if (strategy === "cto_first") {
      w = withdrawTotalWithOrder({
        totalAmount: totalWithdrawalAmount,
        first: { balance: ctoBalance, contributed: ctoContributed, taxRate: CTO_TAX_RATE },
        second: { balance: peaBalance, contributed: peaContributed, taxRate: PEA_TAX_RATE },
      });
      ctoBalance = w.firstBalance;
      peaBalance = w.secondBalance;
      totalCtoTaxes += w.firstTaxes;
      totalPeaTaxes += w.secondTaxes;
      if (retirementYears === 0) firstYearSplit = { pea: w.fromSecond, cto: w.fromFirst };
    } else {
      w = withdrawTotalWithOrder({
        totalAmount: totalWithdrawalAmount,
        first: { balance: peaBalance, contributed: peaContributed, taxRate: PEA_TAX_RATE },
        second: { balance: ctoBalance, contributed: ctoContributed, taxRate: CTO_TAX_RATE },
      });
      peaBalance = w.firstBalance;
      ctoBalance = w.secondBalance;
      totalPeaTaxes += w.firstTaxes;
      totalCtoTaxes += w.secondTaxes;
      if (retirementYears === 0) firstYearSplit = { pea: w.fromFirst, cto: w.fromSecond };
    }

    retirementYears += 1;
  }

  return {
    retirementYears,
    finalTotal: peaBalance + ctoBalance,
    totalTaxes: totalPeaTaxes + totalCtoTaxes,
    firstYearSplit,
    peaAtStart,
    ctoAtStart,
  };
}

function simulate({
  initial,
  annualContribution,
  contributingYears,
  startingAge,
  retirementAge,
  peaWithdrawalAmount,
  ctoWithdrawalAmount,
  peaRate,
  ctoRate,
}) {
  const contributionEndAge = startingAge + contributingYears;
  const retirementStartAge = Math.max(startingAge, retirementAge);

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
  while (age < retirementStartAge) {
    const peaGain = peaBalance * peaRate;
    const ctoGain = ctoBalance * ctoRate;

    const shouldContribute = age < contributionEndAge;
    const allocation = shouldContribute
      ? allocateToPeaAndCto({
          desiredContribution: annualContribution,
          peaContributed,
        })
      : { toPea: 0, toCto: 0, remainingPeaCap: Math.max(0, PEA_CONTRIBUTION_CAP_EUR - peaContributed) };

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
      phase: shouldContribute ? "Accumulation" : "Attente",
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
    retirementAge: retirementStartAge,
    retirementYears,
    valueAtRetirement,
    peaValueAtRetirement:
      yearlyData.find((d) => d.age === retirementStartAge)?.balance ?? peaBalance,
    ctoValueAtRetirement:
      yearlyData.find((d) => d.age === retirementStartAge)?.ctBalance ?? ctoBalance,
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

function setWithdrawalAdvice({ inputs, simulation }) {
  const el = document.getElementById("withdraw-advice");
  if (!el) return;

  const totalAnnual = clampNumber(inputs.peaWithdrawalAmount, { min: 0 }) + clampNumber(inputs.ctoWithdrawalAmount, { min: 0 });

  if (totalAnnual <= 0) {
    el.innerHTML = `<span class="advice-title">Conseil de retrait</span>
      <span class="advice-muted">Renseignez un retrait (mensuel ou annuel) pour obtenir une recommandation PEA/CTO.</span>`;
    return;
  }

  const best = simulateTotalWithdrawalStrategy({
    ...inputs,
    totalWithdrawalAmount: totalAnnual,
    strategy: "cto_first",
  });
  const worst = simulateTotalWithdrawalStrategy({
    ...inputs,
    totalWithdrawalAmount: totalAnnual,
    strategy: "pea_first",
  });

  const bestSplit = best.firstYearSplit;
  const totalFirstYear = bestSplit.pea + bestSplit.cto || 1;
  const ratioCto = bestSplit.cto / totalFirstYear;
  const ratioPea = bestSplit.pea / totalFirstYear;

  const yearsGain = best.retirementYears - worst.retirementYears;
  const taxesDiff = worst.totalTaxes - best.totalTaxes;

  el.innerHTML = `
    <span class="advice-title">Conseil simple (objectif : total le plus “exponentiel”)</span>
    <div><strong>Retirer d’abord du CTO</strong>, puis du PEA une fois le CTO vidé.</div>
    <div class="advice-muted">Idée : garder le PEA investi le plus longtemps possible (fiscalité plus douce sur les plus-values retirées dans ce modèle).</div>
    <div style="margin-top: 8px;">
      <strong>Estimation “meilleur cas”</strong> (1ʳᵉ année de retraite, pour un total de ${formatMoney(totalAnnual)} € / an) :
      CTO ${formatMoney(bestSplit.cto)} € (${Math.round(ratioCto * 100)}%) · PEA ${formatMoney(bestSplit.pea)} € (${Math.round(ratioPea * 100)}%).
    </div>
    <div class="advice-muted" style="margin-top: 6px;">
      Comparaison rapide (CTO→PEA vs PEA→CTO) : ${yearsGain >= 0 ? "+" : ""}${yearsGain} an(s) de retraite simulés, et ${formatMoney(Math.round(taxesDiff))} € d’impôts en moins (ordre de grandeur).
    </div>
  `;
}

function setIncomeSummary({ netIncome, expensesTotal, availableSavings }) {
  const netIncomeEl = document.getElementById("net-income");
  const netIncomeMonthlyEl = document.getElementById("net-income-monthly");
  const expensesTotalEl = document.getElementById("expenses-total");
  const expensesTotalMonthlyEl = document.getElementById(
    "expenses-total-monthly",
  );
  const availableSavingsEl = document.getElementById("available-savings");
  const availableSavingsMonthlyEl = document.getElementById(
    "available-savings-monthly",
  );

  if (netIncomeEl) netIncomeEl.textContent = `${formatMoney(netIncome)} € / an`;
  if (netIncomeMonthlyEl)
    netIncomeMonthlyEl.textContent = `${formatMoney(yearToMonth(netIncome))} € / mois`;
  if (expensesTotalEl)
    expensesTotalEl.textContent = `${formatMoney(expensesTotal)} € / an`;
  if (expensesTotalMonthlyEl)
    expensesTotalMonthlyEl.textContent = `${formatMoney(
      yearToMonth(expensesTotal),
    )} € / mois`;

  if (availableSavingsEl) {
    availableSavingsEl.textContent = `${formatMoney(availableSavings)} € / an`;
    availableSavingsEl.style.color =
      availableSavings >= 0 ? "" : "var(--error)";
  }
  if (availableSavingsMonthlyEl) {
    availableSavingsMonthlyEl.textContent = `${formatMoney(
      yearToMonth(availableSavings),
    )} € / mois`;
    availableSavingsMonthlyEl.style.color =
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
      data.phase === "Retraite" ? "phase-retirement" : "phase-accumulation";

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
      data.phase === "Retraite" ? "phase-retirement" : "phase-accumulation";

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
  setWithdrawalAdvice({ inputs, simulation });
  displayChart(simulation.yearlyData);
  displayPEATable(simulation.yearlyData);
  displayCTOTable(simulation.yearlyData);
  displayWithdrawalsTable(simulation.yearlyData);

  syncAnnualContributionUI(inputs);
  syncRetirementAgeUI(inputs);
  saveState();
}

function getExpensesTotal() {
  const rows = document.querySelectorAll("[data-expense-row]");
  let total = 0;
  rows.forEach((row) => {
    const amountAnnualInput = row.querySelector("[data-expense-amount-annual]");
    const amountMonthlyInput = row.querySelector("[data-expense-amount-monthly]");

    const annual = clampNumber(amountAnnualInput?.value ?? 0, { min: 0 });
    const monthly = clampNumber(amountMonthlyInput?.value ?? 0, { min: 0 });

    total += Math.max(annual, monthToYear(monthly));
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

  const amountMonthlyInput = document.createElement("input");
  amountMonthlyInput.type = "number";
  amountMonthlyInput.min = "0";
  amountMonthlyInput.step = "10";
  amountMonthlyInput.placeholder = "€/mois";
  amountMonthlyInput.value = amount ? String(yearToMonth(amount)) : "";
  amountMonthlyInput.setAttribute("data-expense-amount-monthly", "1");

  const amountAnnualInput = document.createElement("input");
  amountAnnualInput.type = "number";
  amountAnnualInput.min = "0";
  amountAnnualInput.step = "100";
  amountAnnualInput.placeholder = "€/an";
  amountAnnualInput.value = String(amount || "");
  amountAnnualInput.setAttribute("data-expense-amount-annual", "1");

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "btn btn-danger btn-icon";
  removeButton.setAttribute("aria-label", "Supprimer la dépense");
  removeButton.textContent = "×";

  const onAnyChange = () => calculateAndRender();
  labelInput.addEventListener("input", onAnyChange);
  amountMonthlyInput.addEventListener("input", () => {
    const monthly = clampNumber(amountMonthlyInput.value, { min: 0 });
    amountAnnualInput.value = String(monthToYear(monthly));
    onAnyChange();
  });
  amountAnnualInput.addEventListener("input", () => {
    const annual = clampNumber(amountAnnualInput.value, { min: 0 });
    amountMonthlyInput.value = String(yearToMonth(annual));
    onAnyChange();
  });
  removeButton.addEventListener("click", () => {
    row.remove();
    calculateAndRender();
  });

  row.appendChild(labelInput);
  row.appendChild(amountMonthlyInput);
  row.appendChild(amountAnnualInput);
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

function syncRetirementAgeUI({ useAutoRetirementAge }) {
  const retirementAgeEl = document.getElementById("retirement-age");
  const startingAgeEl = document.getElementById("starting-age");
  const contributingYearsEl = document.getElementById("contributing-years");
  if (!retirementAgeEl || !startingAgeEl || !contributingYearsEl) return;

  retirementAgeEl.disabled = useAutoRetirementAge;
  retirementAgeEl.classList.toggle("is-disabled", useAutoRetirementAge);

  if (useAutoRetirementAge) {
    const startingAge = Math.floor(clampNumber(startingAgeEl.value, { min: 0 }));
    const years = Math.floor(clampNumber(contributingYearsEl.value, { min: 0 }));
    retirementAgeEl.value = String(startingAge + years);
  }
}

function syncWithdrawalPair({ annualId, monthlyId }) {
  const annualEl = document.getElementById(annualId);
  const monthlyEl = document.getElementById(monthlyId);
  if (!annualEl || !monthlyEl) return;

  annualEl.addEventListener("input", () => {
    const annual = clampNumber(annualEl.value, { min: 0 });
    monthlyEl.value = String(yearToMonth(annual));
  });
  monthlyEl.addEventListener("input", () => {
    const monthly = clampNumber(monthlyEl.value, { min: 0 });
    annualEl.value = String(monthToYear(monthly));
  });
}

function saveState() {
  const state = {
    theme: document.documentElement.getAttribute("data-theme") || "dark",
    values: {
      initial: document.getElementById("initial")?.value ?? "",
      annualContribution: document.getElementById("annual-contribution")?.value ?? "",
      contributingYears: document.getElementById("contributing-years")?.value ?? "",
      startingAge: document.getElementById("starting-age")?.value ?? "",
      retirementAge: document.getElementById("retirement-age")?.value ?? "",
      useAutoRetirementAge: document.getElementById("use-auto-retirement-age")?.checked ?? true,
      peaReturn: document.getElementById("return")?.value ?? "",
      peaWithdrawal: document.getElementById("pea-withdrawal")?.value ?? "",
      peaWithdrawalMonthly: document.getElementById("pea-withdrawal-monthly")?.value ?? "",
      ctoWithdrawal: document.getElementById("ct-withdrawal")?.value ?? "",
      ctoWithdrawalMonthly: document.getElementById("ct-withdrawal-monthly")?.value ?? "",
      ctoReturn: document.getElementById("ct-return")?.value ?? "7",
      grossSalary: document.getElementById("gross-salary")?.value ?? "",
      grossSalaryMonthly: document.getElementById("gross-salary-monthly")?.value ?? "",
      netRate: document.getElementById("net-rate")?.value ?? "70",
      useAvailableSavings: document.getElementById("use-available-savings")?.checked ?? false,
    },
    expenses: Array.from(document.querySelectorAll("[data-expense-row]")).map((row) => ({
      label: row.querySelector("[data-expense-label]")?.value ?? "",
      amountAnnual: row.querySelector("[data-expense-amount-annual]")?.value ?? "",
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
      setValue("retirement-age", state.values.retirementAge);
      setValue("return", state.values.peaReturn);
      setValue("pea-withdrawal", state.values.peaWithdrawal);
      setValue("pea-withdrawal-monthly", state.values.peaWithdrawalMonthly);
      setValue("ct-withdrawal", state.values.ctoWithdrawal);
      setValue("ct-withdrawal-monthly", state.values.ctoWithdrawalMonthly);
      setValue("ct-return", state.values.ctoReturn);
      setValue("gross-salary", state.values.grossSalary);
      setValue("gross-salary-monthly", state.values.grossSalaryMonthly);
      setValue("net-rate", state.values.netRate);

      const checkbox = document.getElementById("use-available-savings");
      if (checkbox) checkbox.checked = Boolean(state.values.useAvailableSavings);

      const retirementCheckbox = document.getElementById("use-auto-retirement-age");
      if (retirementCheckbox)
        retirementCheckbox.checked =
          state.values.useAutoRetirementAge === undefined
            ? true
            : Boolean(state.values.useAutoRetirementAge);
    }

    const expensesContainer = document.getElementById("expenses-list");
    if (expensesContainer) {
      expensesContainer.innerHTML = "";
      if (Array.isArray(state.expenses) && state.expenses.length > 0) {
        state.expenses.forEach((e) =>
          expensesContainer.appendChild(
            createExpenseRow({
              label: e.label,
              amount: Number(e.amountAnnual) || 0,
            }),
          ),
        );
      }
    }
  } catch {
    // ignore
  }
}

function normalizeSalaryFields() {
  const annualEl = document.getElementById("gross-salary");
  const monthlyEl = document.getElementById("gross-salary-monthly");
  if (!annualEl || !monthlyEl) return;

  const annual = clampNumber(annualEl.value, { min: 0 });
  const monthly = clampNumber(monthlyEl.value, { min: 0 });

  if (annual > 0 && monthly === 0) {
    monthlyEl.value = String(yearToMonth(annual));
    return;
  }
  if (monthly > 0 && annual === 0) {
    annualEl.value = String(monthToYear(monthly));
  }
}

function exportConfigMarkdown() {
  const inputs = readInputs();
  const expenses = Array.from(document.querySelectorAll("[data-expense-row]")).map((row) => ({
    label: (row.querySelector("[data-expense-label]")?.value ?? "").trim(),
    amount: clampNumber(row.querySelector("[data-expense-amount-annual]")?.value ?? 0, { min: 0 }),
  }));

  const lines = [];
  lines.push("# Configuration — Simulateur PEA + CTO");
  lines.push("");
  lines.push("## Paramètres");
  lines.push(`- initial: ${Math.round(inputs.initial)}`);
  lines.push(`- annual_contribution: ${Math.round(inputs.useAvailableSavings ? 0 : inputs.annualContribution)}`);
  lines.push(`- use_available_savings: ${inputs.useAvailableSavings ? "true" : "false"}`);
  lines.push(`- contributing_years: ${Math.round(inputs.contributingYears)}`);
  lines.push(`- starting_age: ${Math.round(inputs.startingAge)}`);
  lines.push(`- retirement_age: ${Math.round(inputs.retirementAge)}`);
  lines.push(`- use_auto_retirement_age: ${inputs.useAutoRetirementAge ? "true" : "false"}`);
  lines.push(`- pea_return_percent: ${Number.isFinite(inputs.peaRate) ? inputs.peaRate * 100 : 0}`);
  lines.push(`- cto_return_percent: ${Number.isFinite(inputs.ctoRate) ? inputs.ctoRate * 100 : 0}`);
  lines.push(`- pea_withdrawal: ${Math.round(inputs.peaWithdrawalAmount)}`);
  lines.push(`- cto_withdrawal: ${Math.round(inputs.ctoWithdrawalAmount)}`);
  lines.push("");
  lines.push("## Revenus");
  lines.push(`- gross_salary: ${Math.round(Math.max(inputs.grossSalary || 0, monthToYear(inputs.grossSalaryMonthly || 0)))}`);
  lines.push(`- net_rate_percent: ${Number(inputs.netRatePercent || 0)}`);
  lines.push("");
  lines.push("## Dépenses annuelles");

  const nonEmptyExpenses = expenses.filter((e) => e.label || e.amount > 0);
  if (nonEmptyExpenses.length === 0) {
    lines.push("- \"Dépenses\": 0");
  } else {
    nonEmptyExpenses.forEach((e) => {
      const safeLabel = (e.label || "Dépense").replace(/"/g, '\\"');
      lines.push(`- "${safeLabel}": ${Math.round(e.amount)}`);
    });
  }

  lines.push("");
  lines.push("<!-- Collez ce fichier dans l'app puis cliquez sur “Importer”. -->");
  lines.push("");

  return lines.join("\n");
}

function parseMarkdownConfig(markdown) {
  const config = {
    values: {},
    expenses: [],
  };

  const lines = String(markdown || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  let inExpenses = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("<!--")) continue;

    if (/^##\s*dépenses annuelles/i.test(line)) {
      inExpenses = true;
      continue;
    }
    if (/^##\s+/i.test(line)) {
      inExpenses = false;
      continue;
    }

    if (!line.startsWith("-")) continue;

    const content = line.replace(/^-+\s*/, "");

    if (inExpenses) {
      const expenseMatch = content.match(/^"?(.*?)"?\s*:\s*(.+)$/);
      if (!expenseMatch) continue;
      const label = expenseMatch[1].trim().replace(/\\"/g, '"');
      const amount = parseNumberLoose(expenseMatch[2]);
      config.expenses.push({ label, amount: Math.max(0, amount) });
      continue;
    }

    const kvMatch = content.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
    if (!kvMatch) continue;
    const key = kvMatch[1];
    const value = kvMatch[2].trim();
    config.values[key] = value;
  }

  return config;
}

function parseNumberLoose(value) {
  const raw = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/,/g, ".");
  const numberValue = Number(raw);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function applyImportedConfig(config) {
  const values = config?.values || {};

  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value ?? "";
  };

  setValue("initial", parseNumberLoose(values.initial));
  setValue("annual-contribution", parseNumberLoose(values.annual_contribution));
  setValue("contributing-years", Math.floor(parseNumberLoose(values.contributing_years)));
  setValue("starting-age", Math.floor(parseNumberLoose(values.starting_age)));
  setValue("retirement-age", Math.floor(parseNumberLoose(values.retirement_age)));
  setValue("return", parseNumberLoose(values.pea_return_percent));
  setValue("ct-return", parseNumberLoose(values.cto_return_percent || values.ct_return_percent));
  setValue("pea-withdrawal", parseNumberLoose(values.pea_withdrawal));
  setValue("pea-withdrawal-monthly", yearToMonth(parseNumberLoose(values.pea_withdrawal)));
  setValue("ct-withdrawal", parseNumberLoose(values.cto_withdrawal));
  setValue("ct-withdrawal-monthly", yearToMonth(parseNumberLoose(values.cto_withdrawal)));
  setValue("gross-salary", parseNumberLoose(values.gross_salary));
  setValue("gross-salary-monthly", yearToMonth(parseNumberLoose(values.gross_salary)));
  setValue("net-rate", parseNumberLoose(values.net_rate_percent));

  const useSavings = String(values.use_available_savings || "").toLowerCase();
  const checkbox = document.getElementById("use-available-savings");
  if (checkbox) checkbox.checked = useSavings === "true" || useSavings === "1" || useSavings === "yes";

  const autoRetirement = String(values.use_auto_retirement_age || "").toLowerCase();
  const retirementCheckbox = document.getElementById("use-auto-retirement-age");
  if (retirementCheckbox)
    retirementCheckbox.checked =
      autoRetirement === ""
        ? true
        : autoRetirement === "true" || autoRetirement === "1" || autoRetirement === "yes";

  const expensesContainer = document.getElementById("expenses-list");
  if (expensesContainer) {
    expensesContainer.innerHTML = "";
    const expenses = Array.isArray(config.expenses) ? config.expenses : [];
    if (expenses.length > 0) {
      expenses.forEach((e) =>
        expensesContainer.appendChild(
          createExpenseRow({ label: e.label || "", amount: Number(e.amount) || 0 }),
        ),
      );
    }
  }

  ensureAtLeastOneExpenseRow();
}

function downloadTextFile({ filename, text }) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function normalizeWithdrawalFields() {
  const pairs = [
    { annualId: "pea-withdrawal", monthlyId: "pea-withdrawal-monthly" },
    { annualId: "ct-withdrawal", monthlyId: "ct-withdrawal-monthly" },
  ];

  for (const pair of pairs) {
    const annualEl = document.getElementById(pair.annualId);
    const monthlyEl = document.getElementById(pair.monthlyId);
    if (!annualEl || !monthlyEl) continue;

    const annual = clampNumber(annualEl.value, { min: 0 });
    const monthly = clampNumber(monthlyEl.value, { min: 0 });

    if (annual > 0 && monthly === 0) {
      monthlyEl.value = String(yearToMonth(annual));
      continue;
    }
    if (monthly > 0 && annual === 0) {
      annualEl.value = String(monthToYear(monthly));
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  restoreState();
  normalizeSalaryFields();
  normalizeWithdrawalFields();
  syncRetirementAgeUI({ useAutoRetirementAge: document.getElementById("use-auto-retirement-age")?.checked ?? true });

  const inputIds = [
    "initial",
    "annual-contribution",
    "contributing-years",
    "pea-withdrawal",
    "pea-withdrawal-monthly",
    "ct-withdrawal",
    "ct-withdrawal-monthly",
    "starting-age",
    "retirement-age",
    "return",
    "ct-return",
    "gross-salary",
    "gross-salary-monthly",
    "net-rate",
    "use-available-savings",
    "use-auto-retirement-age",
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

  const salaryAnnualEl = document.getElementById("gross-salary");
  const salaryMonthlyEl = document.getElementById("gross-salary-monthly");
  if (salaryAnnualEl && salaryMonthlyEl) {
    salaryAnnualEl.addEventListener("input", () => {
      const annual = clampNumber(salaryAnnualEl.value, { min: 0 });
      salaryMonthlyEl.value = String(yearToMonth(annual));
    });
    salaryMonthlyEl.addEventListener("input", () => {
      const monthly = clampNumber(salaryMonthlyEl.value, { min: 0 });
      salaryAnnualEl.value = String(monthToYear(monthly));
    });
  }

  syncWithdrawalPair({
    annualId: "pea-withdrawal",
    monthlyId: "pea-withdrawal-monthly",
  });
  syncWithdrawalPair({
    annualId: "ct-withdrawal",
    monthlyId: "ct-withdrawal-monthly",
  });

  const exportButton = document.getElementById("export-config");
  const downloadButton = document.getElementById("download-config");
  const importButton = document.getElementById("import-config");
  const configTextarea = document.getElementById("config-markdown");

  if (exportButton && configTextarea) {
    exportButton.addEventListener("click", async () => {
      const md = exportConfigMarkdown();
      configTextarea.value = md;
      try {
        await navigator.clipboard.writeText(md);
      } catch {
        // ignore (clipboard may be blocked)
      }
    });
  }

  if (downloadButton && configTextarea) {
    downloadButton.addEventListener("click", () => {
      const md = configTextarea.value?.trim() ? configTextarea.value : exportConfigMarkdown();
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate(),
      ).padStart(2, "0")}`;
      downloadTextFile({ filename: `config-pea-cto-${stamp}.md`, text: md });
    });
  }

  if (importButton && configTextarea) {
    importButton.addEventListener("click", () => {
      const md = configTextarea.value || "";
      const parsed = parseMarkdownConfig(md);
      applyImportedConfig(parsed);
      calculateAndRender();
      saveState();
    });
  }

  ensureAtLeastOneExpenseRow();
  calculateAndRender();
});

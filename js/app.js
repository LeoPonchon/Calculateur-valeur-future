// Simulateur PEA + Compte Titres - Calcul année par année avec courbe

let chart = null;
const PEA_CAPITAL_LIMIT = 150000; // Plafond de versement du PEA en France
const PEA_TAX_RATE = 0.172; // 17.2% prélèvements sociaux (PEA ouvert depuis 5 ans) - appliqué sur les plus-values au retrait uniquement
const CT_TAX_RATE = 0.3; // 30% flat tax (17.2% prélèvements sociaux + 12.8% impôt) - appliqué sur les plus-values au retrait uniquement

function calculate() {
  // Récupérer les valeurs PEA avec validation (valeurs positives ou nulles)
  const initial = Math.max(
    0,
    parseFloat(document.getElementById("initial").value) || 0,
  );
  const annualContribution = Math.max(
    0,
    parseFloat(document.getElementById("annual-contribution").value) || 0,
  );
  const contributingYears = Math.max(
    0,
    parseFloat(document.getElementById("contributing-years").value) || 0,
  );
  const peaWithdrawalAmount = Math.max(
    0,
    parseFloat(document.getElementById("pea-withdrawal").value) || 0,
  );
  const ctWithdrawalAmount = Math.max(
    0,
    parseFloat(document.getElementById("ct-withdrawal").value) || 0,
  );
  const rate = Math.max(
    -50,
    Math.min(100, parseFloat(document.getElementById("return").value) || 0),
  );
  const startingAge = Math.max(
    0,
    parseFloat(document.getElementById("starting-age").value) || 0,
  );

  // Récupérer uniquement le rendement Compte Titres
  const ctRate = Math.max(
    -50,
    Math.min(100, parseFloat(document.getElementById("ct-return").value) || 0),
  );

  // Calculer automatiquement l'âge de retraite
  const retirementAge = startingAge + contributingYears;

  const r = rate / 100;
  const ctR = ctRate / 100;

  // Calculer année par année
  const yearlyData = [];
  let balance = initial;
  let totalContributed = initial;
  let currentAge = startingAge;
  let capReachedAge = null;
  let capReachedMessage = "";

  // Variables Compte Titres (commence à 0, alimenté automatiquement par le PEA)
  let ctBalance = 0;
  let ctTotalContributed = 0;
  let peaFull = false; // Indicateur si le PEA est plein
  let ctContribution = 0; // Versement CT de l'année courante

  // Vérifier si le versement initial dépasse déjà le plafond
  if (totalContributed > PEA_CAPITAL_LIMIT) {
    capReachedMessage = `⚠️ Attention: Votre versement initial de ${formatMoney(initial)} € dépasse le plafond PEA de ${formatMoney(PEA_CAPITAL_LIMIT)} € !`;
  }

  // Phase 1: Accumulation jusqu'à l'âge de retraite
  while (currentAge < retirementAge) {
    ctContribution = 0; // Reset CT contribution at the start of each year

    // Phase d'accumulation : PAS d'imposition, on utilise le gain brut complet
    // L'imposition sera appliquée au moment des retraits (phase de retraite)
    const grossGainPEA = balance * r;

    const grossGainCT = ctBalance * ctR;

    // Vérifier si on atteint le plafond du PEA
    let actualContribution = annualContribution;
    let isCapReached = false;

    if (totalContributed < PEA_CAPITAL_LIMIT) {
      // Il reste de la marge, vérifier si le versement annuel dépasse le plafond
      const remainingCap = PEA_CAPITAL_LIMIT - totalContributed;
      if (actualContribution > remainingCap) {
        // Le versement dépasse le plafond, on verse le reste sur le PEA et le surplus sur le CT
        const peaContribution = remainingCap;
        ctContribution = actualContribution - remainingCap;

        actualContribution = peaContribution;
        isCapReached = true;
        peaFull = true;

        if (capReachedAge === null) {
          capReachedAge = currentAge + 1;
          capReachedMessage = `🚫 Plafond PEA atteint à ${capReachedAge} ans ! Le surplus (${formatMoney(ctContribution)} €) est versé sur le Compte Titres.`;
        }

        // Verser le surplus sur le CT
        ctTotalContributed += ctContribution;
      }
    } else {
      // Plafond déjà atteint, tout va sur le CT
      actualContribution = 0;
      isCapReached = true;
      peaFull = true;
      ctContribution = annualContribution;

      if (capReachedAge === null) {
        capReachedAge = currentAge + 1;
        capReachedMessage = `🚫 Plafond PEA déjà atteint ! Les versements continuent sur le Compte Titres.`;
      }

      // Verser tout sur le CT
      ctTotalContributed += ctContribution;
    }

    // Ajouter le gain NET d'impôts au PEA
    balance = balance + grossGainPEA + actualContribution;
    totalContributed += actualContribution;
    currentAge++;

    // Calcul Compte Titres pour cette année (avec gain brut, pas d'impôt)
    ctBalance = ctBalance + grossGainCT + ctContribution;
    // ctContribution contient le versement CT de l'année courante

    yearlyData.push({
      age: currentAge,
      balance: balance,
      ctBalance: ctBalance,
      totalFinancial: balance + ctBalance,
      contributed: totalContributed,
      ctContributed: ctTotalContributed,
      actualContribution: actualContribution,
      ctContribution: ctContribution,
      phase: "Accumulation",
      capReached: isCapReached,
      // Stocker les gains bruts pour calculer l'impôt au retrait
      grossGainPEA: grossGainPEA,
      grossGainCT: grossGainCT,
      // Suivre le capital investi pour calculer le ratio plus-value au retrait
      peaCapitalInvested: totalContributed,
      ctCapitalInvested: ctTotalContributed,
    });
  }

  // Phase 2: Retraite (retraits à partir de l'âge de retraite)
  let netValueAtRetirement = balance + ctBalance;
  let retirementYears = 0;
  const maxRetirementYears = 50;

  // Récupérer le capital investi à la fin de la phase d'accumulation (une seule fois)
  const lastAccumulationYear = yearlyData[yearlyData.length - 1];
  const peaCapitalInvested = lastAccumulationYear.peaCapitalInvested || 0;
  const ctCapitalInvested = lastAccumulationYear.ctCapitalInvested || 0;

  while (
    (balance > 0 || ctBalance > 0) &&
    retirementYears < maxRetirementYears
  ) {
    // Calculer les gains bruts
    const grossGainPEA = balance * r;
    const grossGainCT = ctBalance * ctR;

    // Ajouter les gains bruts (avant impôt) au PEA
    balance = balance + grossGainPEA;
    ctBalance = ctBalance + grossGainCT;

    // Calculer les retraits et l'impôt sur les plus-values
    let peaWithdrawal = 0;
    let ctWithdrawal = 0;
    let peaTaxableGain = 0; // Part de plus-value imposée dans le retrait PEA
    let ctTaxableGain = 0; // Part de plus-value imposée dans le retrait CT

    // Retrait du PEA (selon le choix de l'utilisateur)
    if (peaWithdrawalAmount > 0 && balance > 0) {
      peaWithdrawal = Math.min(peaWithdrawalAmount, balance);

      // Calculer la part de plus-value dans le retrait PEA
      // Ratio : (valeur totale - capital investi) / valeur totale
      const peaGainRatio = Math.max(
        0,
        (balance - peaCapitalInvested) / balance,
      );
      peaTaxableGain = peaWithdrawal * peaGainRatio;

      balance -= peaWithdrawal;
    }

    // Retrait du Compte Titres (selon le choix de l'utilisateur)
    if (ctWithdrawalAmount > 0 && ctBalance > 0) {
      ctWithdrawal = Math.min(ctWithdrawalAmount, ctBalance);

      // Calculer la part de plus-value dans le retrait CT
      // Ratio : (valeur totale - capital investi) / valeur totale
      const ctGainRatio = Math.max(
        0,
        (ctBalance - ctCapitalInvested) / ctBalance,
      );
      ctTaxableGain = ctWithdrawal * ctGainRatio;

      ctBalance -= ctWithdrawal;
    }

    // Appliquer l'impôt sur les plus-values retirées
    const peaTaxesPaid = peaTaxableGain * PEA_TAX_RATE;
    const ctTaxesPaid = ctTaxableGain * CT_TAX_RATE;

    // Déduire les impôts des soldes (on considère que les impôts sont prélevés séparément)
    // Pour simplifier, on ne les déduit pas ici car ils sont payés à part
    currentAge++;
    retirementYears++;

    yearlyData.push({
      age: currentAge,
      balance: balance,
      ctBalance: ctBalance,
      totalFinancial: balance + ctBalance,
      contributed: totalContributed,
      ctContributed: ctTotalContributed,
      actualContribution: 0,
      ctContribution: 0,
      phase: "Retraite",
      capReached: false,
      // Stocker les montants retirés et les impôts payés sur les plus-values
      peaWithdrawal: peaWithdrawal,
      ctWithdrawal: ctWithdrawal,
      peaTaxableGain: peaTaxableGain,
      ctTaxableGain: ctTaxableGain,
      peaTaxesPaid: peaTaxableGain * PEA_TAX_RATE,
      ctTaxesPaid: ctTaxableGain * CT_TAX_RATE,
    });
  }

  // Afficher le résultat
  const finalProperty = yearlyData[yearlyData.length - 1];
  const finalPatrimony = finalProperty.totalFinancial;

  // Calculer le total des impôts payés pendant la retraite
  let totalPeaTaxes = 0;
  let totalCtTaxes = 0;
  yearlyData.forEach((data) => {
    if (data.phase === "Retraite") {
      totalPeaTaxes += data.peaTaxesPaid || 0;
      totalCtTaxes += data.ctTaxesPaid || 0;
    }
  });

  let resultText = `${formatMoney(finalPatrimony)} € de patrimoine financier à ${retirementAge} ans\n`;
  resultText += `💰 PEA: ${formatMoney(finalProperty.balance)} € (brut)\n`;
  resultText += `📈 Compte Titres: ${formatMoney(finalProperty.ctBalance)} € (brut)\n`;
  if (totalPeaTaxes + totalCtTaxes > 0) {
    resultText += `💸 Impôts payés sur les plus-values retirées: ${formatMoney(totalPeaTaxes + totalCtTaxes)} €\n`;
    resultText += `  • PEA: ${formatMoney(totalPeaTaxes)} € (17.2%)\n`;
    resultText += `  • CT: ${formatMoney(totalCtTaxes)} € (30%)\n`;
  }
  resultText += `⏱️ Soit ${retirementYears} ans de retraite`;

  if (retirementYears >= maxRetirementYears) {
    resultText += ` (rente viagère ! 🎉)`;
  }

  document.getElementById("result").textContent = resultText;

  // Afficher le message de plafond atteint
  const capWarningElement = document.getElementById("cap-warning");
  if (capWarningElement) {
    capWarningElement.textContent = capReachedMessage;
    capWarningElement.style.display = capReachedMessage ? "block" : "none";
  }

  // Afficher la courbe
  displayChart(yearlyData);

  // Afficher le tableau
  displayTable(yearlyData);
}

function displayChart(yearlyData) {
  const ctx = document.getElementById("chart").getContext("2d");

  if (chart) {
    chart.destroy();
  }

  const ages = yearlyData.map((d) => d.age);
  const peaBalances = yearlyData.map((d) => d.balance);
  const ctBalances = yearlyData.map((d) => d.ctBalance);
  const totalFinancial = yearlyData.map((d) => d.totalFinancial);
  const totalContributed = yearlyData.map(
    (d) => d.contributed + d.ctContributed,
  );

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: ages,
      datasets: [
        {
          label: "Total financier",
          data: totalFinancial,
          borderColor: "#8b5cf6",
          backgroundColor: "rgba(139, 92, 246, 0.1)",
          fill: true,
          tension: 0.4,
        },
        {
          label: "PEA",
          data: peaBalances,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          tension: 0.4,
        },
        {
          label: "Compte Titres",
          data: ctBalances,
          borderColor: "#06b6d4",
          backgroundColor: "rgba(6, 182, 212, 0.1)",
          borderDash: [5, 5],
          tension: 0.4,
        },
        {
          label: "Total versé",
          data: totalContributed,
          borderColor: "#9ca3af",
          backgroundColor: "rgba(156, 163, 175, 0.1)",
          borderDash: [2, 2],
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: "Évolution du patrimoine dans le temps",
          color: "#f9fafb",
          font: {
            size: 18,
            weight: "bold",
          },
          padding: {
            bottom: 20,
          },
        },
        legend: {
          labels: {
            color: "#d1d5db",
          },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              let label = context.dataset.label || "";
              if (label) {
                label += ": ";
              }
              label += formatMoney(context.parsed.y) + " €";
              return label;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: "#9ca3af",
            callback: function (value) {
              return formatMoney(value) + " €";
            },
          },
          grid: {
            color: "rgba(255, 255, 255, 0.05)",
          },
        },
        x: {
          ticks: {
            color: "#9ca3af",
          },
          grid: {
            color: "rgba(255, 255, 255, 0.05)",
          },
        },
      },
    },
  });
}

function formatMoney(amount) {
  return Math.round(amount).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function displayTable(yearlyData) {
  const tbody = document.getElementById("yearly-data");
  tbody.innerHTML = "";

  yearlyData.forEach((data, index) => {
    const row = document.createElement("tr");

    // Calculer le gain annuel NET d'impôts (variation de la valeur hors nouveaux versements)
    let yearlyGainPEA = 0;
    let yearlyGainCT = 0;
    if (index === 0) {
      // Première année : gain = balance - (versement initial + versement annuel)
      yearlyGainPEA = data.balance - data.contributed;
      yearlyGainCT = data.ctBalance - data.ctContributed;
    } else {
      // Années suivantes : gain = (balance - précédent) - (versé - précédent)
      const previousData = yearlyData[index - 1];
      const balanceChange = data.balance - previousData.balance;
      const contributionChange = data.contributed - previousData.contributed;
      yearlyGainPEA = balanceChange - contributionChange;

      const ctBalanceChange = data.ctBalance - previousData.ctBalance;
      const ctContributionChange =
        data.ctContributed - previousData.ctContributed;
      yearlyGainCT = ctBalanceChange - ctContributionChange;
    }

    const totalYearlyGain = yearlyGainPEA + yearlyGainCT;

    // Calculer le gain cumulé NET d'impôts
    const totalGainPEA = data.balance - data.contributed;
    const totalGainCT = data.ctBalance - data.ctContributed;
    const totalGain = totalGainPEA + totalGainCT;

    // Ajouter une classe pour la phase
    const phaseClass =
      data.phase === "Accumulation" ? "phase-accumulation" : "phase-retirement";

    // Affichage Compte Titres
    let ctText = data.ctBalance > 0 ? formatMoney(data.ctBalance) + " €" : "-";
    let ctContributedText =
      data.ctContributed > 0 ? formatMoney(data.ctContributed) + " €" : "-";

    // Classes pour les gains (positif/négatif) - SEULES couleurs gardées
    const yearlyGainClass =
      totalYearlyGain >= 0 ? "text-success" : "text-danger";
    const totalGainClass = totalGain >= 0 ? "text-success" : "text-danger";
    const yearlyGainSign = totalYearlyGain >= 0 ? "+" : "";
    const totalGainSign = totalGain >= 0 ? "+" : "";

    row.innerHTML = `
            <td>${data.age} ans</td>
            <td><span class="${phaseClass}">${data.phase}</span></td>
            <td>${formatMoney(data.balance)} €</td>
            <td>${data.actualContribution > 0 ? formatMoney(data.actualContribution) + " €" : "-"}</td>
            <td>${formatMoney(data.contributed)} €</td>
            <td>${ctText}</td>
            <td>${data.ctContribution > 0 ? formatMoney(data.ctContribution) + " €" : "-"}</td>
            <td>${ctContributedText}</td>
            <td class="${yearlyGainClass}">${yearlyGainSign}${formatMoney(totalYearlyGain)} €</td>
            <td class="${totalGainClass}">${totalGainSign}${formatMoney(totalGain)} €</td>
            <td>${formatMoney(data.totalFinancial)} €</td>
        `;

    tbody.appendChild(row);
  });
}

// Ajouter les écouteurs d'événements pour le calcul en temps réel
document.addEventListener("DOMContentLoaded", function () {
  const inputs = [
    "initial",
    "annual-contribution",
    "contributing-years",
    "pea-withdrawal",
    "ct-withdrawal",
    "starting-age",
    "return",
    "ct-return",
  ];

  inputs.forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("input", calculate);
    }
  });

  // Calcul initial
  calculate();
});

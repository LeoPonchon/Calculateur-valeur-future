// Simulateur PEA - Calcul année par année avec courbe

let chart = null;

function calculate() {
  // Récupérer les valeurs
  const initial = parseFloat(document.getElementById("initial").value) || 0;
  const annualContribution =
    parseFloat(document.getElementById("annual-contribution").value) || 0;
  const contributingYears =
    parseFloat(document.getElementById("contributing-years").value) || 0;
  const annualWithdrawal =
    parseFloat(document.getElementById("annual-withdrawal").value) || 0;
  const rate = parseFloat(document.getElementById("return").value) || 0;
  const startingAge =
    parseFloat(document.getElementById("starting-age").value) || 30;

  // Calculer automatiquement l'âge de retraite
  const retirementAge = startingAge + contributingYears;

  const r = rate / 100;

  // Calculer année par année
  const yearlyData = [];
  let balance = initial;
  let totalContributed = initial;
  let currentAge = startingAge;

  // Phase 1: Accumulation jusqu'à l'âge de retraite
  while (currentAge < retirementAge) {
    const gain = balance * r;
    balance = balance + gain + annualContribution;
    totalContributed += annualContribution;
    currentAge++;

    yearlyData.push({
      age: currentAge,
      balance: balance,
      contributed: totalContributed,
      phase: "Accumulation",
    });
  }

  // Phase 2: Retraite (retraits à partir de l'âge de retraite)
  let netValueAtRetirement = balance;
  let retirementYears = 0;
  const maxRetirementYears = 50;

  while (balance > 0 && retirementYears < maxRetirementYears) {
    const gain = balance * r;
    balance = balance + gain - annualWithdrawal;
    currentAge++;
    retirementYears++;

    yearlyData.push({
      age: currentAge,
      balance: Math.max(0, balance),
      contributed: totalContributed,
      phase: "Retraite",
    });
  }

  // Afficher le résultat
  let resultText = `${formatMoney(netValueAtRetirement)} € à ${retirementAge} ans\n`;
  resultText += `⏱️ Soit ${retirementYears} ans de retraite`;

  if (retirementYears >= maxRetirementYears) {
    resultText += ` (rente viagère ! 🎉)`;
  }

  document.getElementById("result").textContent = resultText;

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

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: yearlyData.map((d) => `${d.age} ans`),
      datasets: [
        {
          label: "Valeur du PEA",
          data: yearlyData.map((d) => d.balance),
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          fill: true,
          tension: 0.1,
        },
        {
          label: "Total versé",
          data: yearlyData.map((d) => d.contributed),
          borderColor: "#10b981",
          backgroundColor: "transparent",
          borderDash: [5, 5],
          tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#f9fafb",
          },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return (
                context.dataset.label + ": " + formatMoney(context.raw) + " €"
              );
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: "#f9fafb",
            callback: function (value) {
              return formatMoney(value) + " €";
            },
          },
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
          },
        },
        x: {
          ticks: {
            color: "#f9fafb",
          },
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
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

    // Calculer le gain annuel (variation de la valeur hors nouveaux versements)
    let yearlyGain = 0;
    if (index === 0) {
      // Première année : gain = balance - (versement initial + versement annuel)
      yearlyGain = data.balance - data.contributed;
    } else {
      // Années suivantes : gain = (balance - précédent) - (versé - précédent)
      const previousData = yearlyData[index - 1];
      const balanceChange = data.balance - previousData.balance;
      const contributionChange = data.contributed - previousData.contributed;
      yearlyGain = balanceChange - contributionChange;
    }

    // Calculer le gain cumulé
    const totalGain = data.balance - data.contributed;

    // Ajouter une classe pour la phase
    const phaseClass =
      data.phase === "Accumulation" ? "phase-accumulation" : "phase-retirement";

    row.innerHTML = `
      <td>${data.age} ans</td>
      <td><span class="${phaseClass}">${data.phase}</span></td>
      <td>${formatMoney(data.balance)} €</td>
      <td>${formatMoney(data.contributed)} €</td>
      <td style="color: ${yearlyGain >= 0 ? "#10b981" : "#ef4444"}">${yearlyGain >= 0 ? "+" : ""}${formatMoney(yearlyGain)} €</td>
      <td style="color: ${totalGain >= 0 ? "#10b981" : "#ef4444"}">${totalGain >= 0 ? "+" : ""}${formatMoney(totalGain)} €</td>
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
    "starting-age",
    "return",
    "annual-withdrawal",
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

document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    const capital = $('capital');
    const taux = $('taux');
    const periodes = $('periodes');
    const salaire = $('salaire-brut-annuel');
    const epargne = $('taux-epargne');
    const chargesSal = $('charges-salariales');
    const partsEl = $('parts');
    const eau = $('cout-eau');
    const electricite = $('cout-electricite');
    const gaz = $('cout-gaz');
    const nourriture = $('cout-nourriture');
    const internet = $('cout-internet');
    const telephonie = $('cout-telephonie');
    const habillement = $('cout-habillement');
    const pret = $('cout-pret');
    const res = $('resultat');
    const apport = $('apport-calc');
    const histo = $('historique');
    const chartSite = document.getElementById('chart-site');

    const euro = (v) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    const num = (el) => Math.max(0, Number(el.value) || 0);

    const calcIR = (revenuImposable, parts) => {
        const tranches = [11497, 29315, 83823, 180294];
        const taux = [0, 0.11, 0.30, 0.41, 0.45];
        const base = Math.max(0, revenuImposable / Math.max(0.5, parts));
        let impotParPart = 0;
        let prev = 0;
        for (let i = 0; i < tranches.length; i++) {
            const plafond = tranches[i];
            if (base > prev) {
                const taxable = Math.min(base, plafond) - prev;
                if (taxable > 0) impotParPart += taxable * taux[i];
                prev = plafond;
            }
        }
        if (base > prev) impotParPart += (base - prev) * taux[taux.length - 1];
        return impotParPart * Math.max(0.5, parts);
    };

    const calc = () => {
        const P0 = num(capital);
        const r = num(taux) / 100;
        const n = num(periodes);
        const brut = num(salaire);
        const tauxEpargne = num(epargne);
        const cs = num(chargesSal) / 100;
        const nbParts = Math.max(0.5, Number(partsEl.value) || 1);
        const depenses = num(eau) + num(electricite) + num(gaz) + num(internet) + num(telephonie) + num(habillement) + num(nourriture) + num(pret);

        const netImposable = brut * (1 - cs);
        const impot = calcIR(netImposable, nbParts);
        const netApresImpots = Math.max(0, netImposable - impot);
        const disponible = Math.max(0, netApresImpots - depenses);
        const versement = disponible * (tauxEpargne / 100);
        const resteApresEpargne = Math.max(0, disponible - versement);

        const growth = Math.pow(1 + r, n);
        const fvCapital = P0 * growth;
        const fvVersements = (versement > 0 && n > 0) ? (r === 0 ? versement * n : versement * ((growth - 1) / r)) : 0;
        const total = fvCapital + fvVersements;

        res.textContent = 'Valeur future: ' + euro(total);
        const montantCharges = brut * cs;
        const vEau = num(eau);
        const vElec = num(electricite);
        const vGaz = num(gaz);
        const vInternet = num(internet);
        const vTel = num(telephonie);
        const vHab = num(habillement);
        const vNour = num(nourriture);
        const vPret = num(pret);
        const totalFixes = vEau + vElec + vGaz + vInternet + vTel + vHab + vNour + vPret;
        const details = [
            '<strong>Apport annuel calculé:</strong> ' + euro(versement),
            'Brut: ' + euro(brut),
            '- Charges salariales (' + (cs * 100).toFixed(2) + '%): ' + euro(montantCharges),
            '= Net imposable: ' + euro(netImposable),
            '- Impôt sur le revenu (barème progressif, ' + nbParts + ' part' + (nbParts > 1 ? 's' : '') + '): ' + euro(impot),
            '- Charges fixes (eau + électricité + gaz + internet + téléphonie + habillement + nourriture + prêt): ' +
            `${euro(vEau)} + ${euro(vElec)} + ${euro(vGaz)} + ${euro(vInternet)} + ${euro(vTel)} + ${euro(vHab)} + ${euro(vNour)} + ${euro(vPret)} = ${euro(totalFixes)}`,
            '= Reste à vivre: ' + euro(disponible),
            '× Taux d\'épargne: ' + tauxEpargne.toFixed(2) + '%',
            '= Reste à vivre après épargne: ' + euro(resteApresEpargne)
        ].join('<br>');
        apport.innerHTML = details;

        let cumul = P0;
        const lignes = ['<strong>Évolution annuelle:</strong><br>'];
        for (let i = 1; i <= n; i++) {
            cumul = cumul * (1 + r) + versement;
            lignes.push(`Année ${i}: ${euro(cumul)}<br>`);
        }
        histo.innerHTML = lignes.join('');

        // Courbe de croissance (site)
        const serie = [];
        let acc = P0;
        for (let i = 0; i <= n; i++) {
            if (i > 0) acc = acc * (1 + r) + versement;
            serie.push({ x: i, y: acc });
        }
        renderLineChart(chartSite, serie, { width: 680, height: 220, padding: 28, paddingLeftExtra: 50 });
    };

    function renderLineChart(container, points, { width = 600, height = 200, padding = 24, paddingLeftExtra = 40 } = {}) {
        if (!container) return;
        container.innerHTML = '';
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = 0, maxY = Math.max(...ys) || 1;
        const leftPad = padding + paddingLeftExtra;
        const ix = (x) => leftPad + (x - minX) * (width - (leftPad + padding)) / (maxX - minX || 1);
        const iy = (y) => height - padding - (y - minY) * (height - 2 * padding) / (maxY - minY || 1);

        const gridY = Array.from({ length: 4 }, (_, i) => minY + (i + 1) * (maxY - minY) / 4);
        const fmt = (v) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
        const yLabels = [minY, ...gridY, maxY];
        const svg = `
            <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">
                <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>
                ${gridY.map(g => `<line x1="${leftPad}" y1="${iy(g)}" x2="${width - padding}" y2="${iy(g)}" stroke="#1f2937" stroke-width="1" />`).join('')}
                <polyline fill="none" stroke="#22c55e" stroke-width="2" points="${points.map(p => `${ix(p.x)},${iy(p.y)}`).join(' ')}" />
                ${yLabels.map(g => `<text x="${leftPad - 8}" y="${iy(g) + 3}" fill="#9ca3af" font-size="9" text-anchor="end">${fmt(g)}</text>`).join('')}
                <text x="${leftPad}" y="${height - padding + 12}" fill="#9ca3af" font-size="10">${Math.min(...xs)} an</text>
                <text x="${width - padding}" y="${height - padding + 12}" fill="#9ca3af" font-size="10" text-anchor="end">${Math.max(...xs)} an</text>
            </svg>`;
        container.innerHTML = svg;
    }

    const indice = $('indice-select');
    const tbody = $('indices-tbody');
    const data = {
        msciWorld: [
            { year: 2019, percent: 28.40 }, { year: 2020, percent: 16.50 }, { year: 2021, percent: 22.35 },
            { year: 2022, percent: -14.07 }, { year: 2023, percent: 22.35 }, { year: 2024, percent: 19.19 }
        ],
        sp500: [
            { year: 2019, percent: 28.88 }, { year: 2020, percent: 16.26 }, { year: 2021, percent: 26.89 },
            { year: 2022, percent: -18.11 }, { year: 2023, percent: 26.89 }, { year: 2024, percent: 23.31 }
        ],
        stoxx600: [
            { year: 2019, percent: 28.00 }, { year: 2020, percent: -0.32 }, { year: 2021, percent: 26.30 },
            { year: 2022, percent: -12.78 }, { year: 2023, percent: 18.90 }, { year: 2024, percent: 4.12 }
        ],
        nasdaq100: [
            { year: 2019, percent: 37.96 }, { year: 2020, percent: 47.58 }, { year: 2021, percent: 26.63 },
            { year: 2022, percent: -32.97 }, { year: 2023, percent: 53.81 }, { year: 2024, percent: 24.88 }
        ]
    };

    const pct = (p) => (p >= 0 ? '+' : '') + p.toFixed(2) + ' %';
    const renderTable = (rows) => {
        const list = rows && rows.length ? rows : (data[indice.value] || []);
        tbody.innerHTML = list.length
            ? list.map(r => `<tr><td>${r.year}</td><td>${pct(r.percent)}</td></tr>`).join('')
            : `<tr><td colspan=\"2\" style=\"color:var(--muted)\">Aucune donnée à afficher</td></tr>`;
        // Store last list on element for quick access
        tbody._lastRows = list;
    };

    // Source publique sans clé: stooq (CSV)
    const stooqSymbols = {
        msciWorld: ['URTH.US', 'ACWI.US', 'VT.US'],
        sp500: ['^SPX', 'SPY.US'],
        stoxx600: ['^SXXP', 'EXSA.DE'],
        nasdaq100: ['^NDX', 'QQQ.US']
    };

    async function fetchStooqDaily(symbol) {
        const base = `stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase())}&i=d`;
        const urls = [
            `https://${base}`,
            `https://r.jina.ai/http://${base}`,
            `https://r.jina.ai/https://${base}`
        ];
        let csv = '';
        let lastErr = null;
        for (const url of urls) {
            try {
                const resp = await fetch(url, { cache: 'no-store' });
                if (!resp.ok) { lastErr = new Error('HTTP ' + resp.status); continue; }
                csv = await resp.text();
                if (csv && /Date,Open,High,Low,Close,Volume/i.test(csv)) break;
            } catch (e) { lastErr = e; }
        }
        if (!csv) throw (lastErr || new Error('No response'));
        if (!/Date,Open,High,Low,Close,Volume/i.test(csv)) throw new Error('Unexpected CSV');
        const lines = csv.trim().split(/\r?\n/).slice(1);
        if (!lines.length) throw new Error('Empty CSV');
        return lines.map(line => {
            const [dateStr, , , , closeStr] = line.split(',');
            return { date: new Date(dateStr), close: Number(closeStr) };
        }).filter(d => Number.isFinite(d.close));
    }

    function computeAnnualReturns(daily) {
        const byYear = new Map();
        for (const { date, close } of daily) {
            const y = date.getFullYear();
            const rec = byYear.get(y) || { first: close, last: close, firstDate: date, lastDate: date };
            if (date < rec.firstDate) { rec.firstDate = date; rec.first = close; }
            if (date > rec.lastDate) { rec.lastDate = date; rec.last = close; }
            byYear.set(y, rec);
        }
        const years = Array.from(byYear.keys()).sort((a, b) => a - b);
        const last10 = years.slice(-10);
        return last10.map(y => {
            const { first, last } = byYear.get(y);
            return { year: y, percent: (last / first - 1) * 100 };
        });
    }

    async function tryFetchSymbols(keys) {
        for (const s of keys) {
            try {
                const daily = await fetchStooqDaily(s);
                const rows = computeAnnualReturns(daily);
                if (rows && rows.length) return rows;
            } catch (e) { /* continue */ }
        }
        throw new Error('fallback');
    }

    async function loadIndice() {
        const key = indice.value;
        try {
            const rows = await tryFetchSymbols(stooqSymbols[key] || []);
            renderTable(rows);
            const sb = document.getElementById('source-badge');
            if (sb) { sb.className = 'badge live'; sb.textContent = 'données en direct'; }
            return;
        } catch { }
        try {
            const categories = Object.keys(stooqSymbols);
            const seriesList = [];
            for (const cat of categories) {
                try {
                    const r = await tryFetchSymbols(stooqSymbols[cat]);
                    seriesList.push(r);
                } catch { }
            }
            if (seriesList.length) {
                const yearSet = seriesList.reduce((acc, rows) => { rows.forEach(r => acc.add(r.year)); return acc; }, new Set());
                const years = Array.from(yearSet).sort((a, b) => a - b).slice(-10);
                const avgRows = years.map(y => {
                    const vals = seriesList.map(rows => rows.find(r => r.year === y)?.percent).filter(v => Number.isFinite(v));
                    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                    return { year: y, percent: avg };
                });
                renderTable(avgRows);
                const sb = document.getElementById('source-badge');
                if (sb) { sb.className = 'badge avg'; sb.textContent = 'moyenne dynamique'; }
                return;
            }
        } catch { }
        renderTable();
        const sb = document.getElementById('source-badge');
        if (sb) { sb.className = 'badge static'; sb.textContent = 'données de secours'; }
    }

    $('fv-form').addEventListener('submit', (e) => { e.preventDefault(); calc(); });
    $('reset').addEventListener('click', () => {
        capital.value = '0';
        taux.value = '0';
        periodes.value = '0';
        salaire.value = '0';
        epargne.value = '0';
        chargesSal.value = '22';
        partsEl.value = '1';
        eau.value = '0';
        electricite.value = '0';
        gaz.value = '0';
        internet.value = '0';
        telephonie.value = '0';
        habillement.value = '0';
        nourriture.value = '0';
        pret.value = '0';
        calc();
        capital.focus();
    });
    $('export-pdf').addEventListener('click', () => {
        // Génère un rapport synthétique Données / Calculs / Résultats
        const P0 = num(capital);
        const r = num(taux) / 100;
        const n = num(periodes);
        const brut = num(salaire);
        const cs = num(chargesSal) / 100;
        const nbParts = Math.max(0.5, Number(partsEl.value) || 1);
        const vEau = num(eau);
        const vElec = num(electricite);
        const vGaz = num(gaz);
        const vInternet = num(internet);
        const vTel = num(telephonie);
        const vHab = num(habillement);
        const vNour = num(nourriture);
        const vPret = num(pret);
        const totalFixes = vEau + vElec + vGaz + vInternet + vTel + vHab + vNour + vPret;
        const netImposable = brut * (1 - cs);
        const impot = calcIR(netImposable, nbParts);
        const netApresImpots = Math.max(0, netImposable - impot);
        const reste = Math.max(0, netApresImpots - totalFixes);
        const tauxEpargneVal = Math.max(0, Number(epargne.value) || 0);
        const versement = reste * (tauxEpargneVal / 100);
        const resteApresEpargne = Math.max(0, reste - versement);

        const growth = Math.pow(1 + r, n);
        const fvCapital = P0 * growth;
        const fvVersements = (versement > 0 && n > 0) ? (r === 0 ? versement * n : versement * ((growth - 1) / r)) : 0;
        const total = fvCapital + fvVersements;

        const header = `<div class="header"><h1>Plan millionaire en 20 ans</h1><div class="sub">${new Date().toLocaleDateString('fr-FR')}</div></div>`;
        const blocDonnees = `
            <section class="section">
                <h2>Données</h2>
                <table><tbody>
                    <tr><td>Montant initial</td><td>${euro(P0)}</td></tr>
                    <tr><td>Taux annuel</td><td>${(r * 100).toFixed(2)} %</td></tr>
                    <tr><td>Nombre de périodes</td><td>${n}</td></tr>
                    <tr><td>Salaire brut annuel</td><td>${euro(brut)}</td></tr>
                    <tr><td>Charges salariales</td><td>${(cs * 100).toFixed(2)} %</td></tr>
                    <tr><td>Nombre de parts</td><td>${nbParts}</td></tr>
                    <tr><td>Taux d'épargne</td><td>${tauxEpargneVal.toFixed(2)} %</td></tr>
                    <tr><td colspan="2"><strong>Charges fixes annuelles</strong></td></tr>
                    <tr><td>Eau</td><td>${euro(vEau)}</td></tr>
                    <tr><td>Électricité</td><td>${euro(vElec)}</td></tr>
                    <tr><td>Gaz / Chauffage</td><td>${euro(vGaz)}</td></tr>
                    <tr><td>Internet</td><td>${euro(vInternet)}</td></tr>
                    <tr><td>Téléphonie</td><td>${euro(vTel)}</td></tr>
                    <tr><td>Habillement</td><td>${euro(vHab)}</td></tr>
                    <tr><td>Courses / Nourriture</td><td>${euro(vNour)}</td></tr>
                    <tr><td>Prêt immobilier</td><td>${euro(vPret)}</td></tr>
                    <tr><td><strong>Total charges fixes</strong></td><td><strong>${euro(totalFixes)}</strong></td></tr>
                </tbody></table>
            </section>`;
        const blocCalculs = `
            <section class="section">
                <h2>Calculs</h2>
                <table><tbody>
                    <tr><td>Net imposable</td><td>${euro(netImposable)}</td></tr>
                    <tr><td>Impôt sur le revenu (barème, ${nbParts} part${nbParts > 1 ? 's' : ''})</td><td>${euro(impot)}</td></tr>
                    <tr><td>Charges fixes (eau + électricité + gaz + internet + téléphonie + habillement + nourriture + prêt)</td><td><strong>${euro(totalFixes)}</strong> (${euro(vEau)} + ${euro(vElec)} + ${euro(vGaz)} + ${euro(vInternet)} + ${euro(vTel)} + ${euro(vHab)} + ${euro(vNour)} + ${euro(vPret)})</td></tr>
                    <tr><td>Reste à vivre</td><td>${euro(reste)}</td></tr>
                    <tr><td>Apport annuel</td><td>${euro(versement)} (${tauxEpargneVal.toFixed(2)} %)</td></tr>
                    <tr><td>Reste à vivre après épargne</td><td>${euro(resteApresEpargne)}</td></tr>
                    <tr><td>Valeur future du capital initial</td><td>${euro(fvCapital)}</td></tr>
                    <tr><td>Valeur future des versements</td><td>${euro(fvVersements)}</td></tr>
                </tbody></table>
            </section>`;
        // Série temps pour la courbe PDF
        const serie = [];
        let acc = P0;
        for (let i = 0; i <= n; i++) {
            if (i > 0) acc = acc * (1 + r) + versement;
            serie.push({ x: i, y: acc });
        }
        const chartSvg = (() => {
            const width = 680, height = 170, padding = 24;
            const xs = serie.map(p => p.x);
            const ys = serie.map(p => p.y);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = 0, maxY = Math.max(...ys) || 1;
            const leftPad = padding + 50;
            const ix = (x) => leftPad + (x - minX) * (width - (leftPad + padding)) / (maxX - minX || 1);
            const iy = (y) => height - padding - (y - minY) * (height - 2 * padding) / (maxY - minY || 1);
            const gridY = Array.from({ length: 5 }, (_, i) => minY + (i + 1) * (maxY - minY) / 5);
            const gridX = Array.from({ length: Math.min(8, (maxX - minX) || 1) + 1 }, (_, i) => minX + Math.round((maxX - minX) * (i / Math.min(8, (maxX - minX) || 1))));
            const fmt = (v) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
            return `
                <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">
                    <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>
                    ${gridY.map(g => `<line x1="${leftPad}" y1="${iy(g)}" x2="${width - padding}" y2="${iy(g)}" stroke="#e5e7eb" stroke-width="1" />`).join('')}
                    ${gridX.map(g => `<line x1="${ix(g)}" y1="${padding}" x2="${ix(g)}" y2="${height - padding}" stroke="#f1f5f9" stroke-width="1" />`).join('')}
                    <polyline fill="none" stroke="#16a34a" stroke-width="2" points="${serie.map(p => `${ix(p.x)},${iy(p.y)}`).join(' ')}" />
                    ${[minY, ...gridY, maxY].map(g => `<text x="${leftPad - 8}" y="${iy(g) + 3}" fill="#6b7280" font-size="8" text-anchor="end">${fmt(g)}</text>`).join('')}
                    <text x="${leftPad}" y="${height - padding + 10}" fill="#6b7280" font-size="9">${Math.min(...xs)} an</text>
                    ${gridX.map(g => `<text x="${ix(g)}" y="${height - padding + 10}" fill="#94a3b8" font-size="8" text-anchor="middle">${g}</text>`).join('')}
                    <text x="${width - padding}" y="${height - padding + 10}" fill="#6b7280" font-size="9" text-anchor="end">${Math.max(...xs)} an</text>
                </svg>`;
        })();

        const blocResultats = `
            <section class="section">
                <h2>Résultats</h2>
                <table><tbody>
                    <tr><td><strong>Valeur future totale</strong></td><td><strong>${euro(total)}</strong></td></tr>
                </tbody></table>
                <div style="margin-top:4px">${chartSvg}</div>
            </section>`;

        document.getElementById('rapport').innerHTML = header + blocDonnees + blocCalculs + blocResultats;
        window.print();
    });
    // Copier la moyenne des 10 dernières années dans le presse-papier
    (function bindCopyAvg() {
        const btn = document.getElementById('copy-avg');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            const rows = tbody._lastRows || [];
            if (!rows.length) { alert('Aucune donnée disponible.'); return; }
            const avg = rows.reduce((a, b) => a + b.percent, 0) / rows.length;
            try {
                await navigator.clipboard.writeText(avg.toFixed(2));
                btn.textContent = 'Copié: ' + avg.toFixed(2) + ' %';
                setTimeout(() => { btn.textContent = 'Copier moyenne 10 ans'; }, 2000);
            } catch {
                alert('Impossible de copier. Valeur: ' + avg.toFixed(2) + ' %');
            }
        });
    })();
    indice.addEventListener('change', () => { loadIndice(); });

    calc();
    loadIndice();
});



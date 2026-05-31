# Simulateur PEA (plafond 150 000 €)

Simulateur statique (HTML/CSS/JS) pour estimer l'évolution d'un portefeuille en phase de versements, puis en phase de retraits.

## Règle du plafond PEA

- Le plafond PEA est fixé à **150 000 € de versements**.
- Les **plus-values ne comptent pas** dans ce plafond (on suit séparément les versements cumulés).
- Une fois le plafond atteint, tout nouveau versement est automatiquement dirigé vers le **compte-titres (CTO)**.

## Hypothèses de la simulation

- Rendement annuel constant (même taux appliqué à la poche PEA et à la poche CTO).
- Retraits annuels constants à partir de l'âge de retraite (à la fin des années de versement).
- Retraits prélevés sur le PEA en priorité, puis sur le CTO.
- Option : calculer le versement annuel à partir de `Salaire brut annuel × Net estimé` moins les dépenses annuelles.

## Lancer

Ouvrir `index.html` dans un navigateur.

## Export / import de configuration

Dans l'onglet **Configuration**, vous pouvez exporter/importer vos paramètres (et vos dépenses) en **Markdown**.

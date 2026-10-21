# Carte Onduleur UPS

Carte Lovelace pour Home Assistant qui affiche l'état d'un **onduleur (UPS)** : batterie et autonomie, charge et puissance, tensions, plage secteur acceptée, prises pilotables et alerte en cas de coupure.

Elle est conçue pour l'intégration **[Network UPS Tools (NUT)](https://www.home-assistant.io/integrations/nut/)** et fonctionne donc avec toutes les marques que NUT prend en charge : **Eaton, APC, CyberPower, Riello, Legrand, Salicru, Infosec**, etc. Pour une autre intégration, chaque capteur peut être choisi à la main.

Elle a le même style que la [Carte Enedis Linky New](https://github.com/Marlboro62/content-card-linky-new), mais elle est **indépendante** : type `custom:onduleur-ups-card`, ressource à part.

| Secteur (sombre) | Clair | Coupure, batterie faible |
| --- | --- | --- |
| ![Secteur](images/eaton-sombre.png) | ![Clair](images/eaton-clair.png) | ![Sur batterie](images/sur-batterie.png) |

*Aperçus avec les valeurs d'un Eaton 3S 850 reproduites.*

## Ce que la carte affiche

- **En-tête** : nom, modèle, fabricant et micrologiciel de l'appareil, et un **badge d'état** traduit (Secteur, Sur batterie, Batterie faible, En charge, Surcharge, Batterie à remplacer, Bypass…).
- **Batterie** : charge en %, **autonomie** lisible (« 33 min 39 s » au lieu de « 2 019 s ») et repère du seuil de batterie faible.
- **Charge** : % de charge et **puissance en W**. Sans capteur de puissance réelle, elle est estimée à partir de la puissance nominale et marquée « ≈ ».
- **Mesures** : tension d'entrée et de sortie (avec la valeur nominale), fréquence, tension de batterie, température, selon ce que l'onduleur remonte.
- **Plage secteur acceptée** : les seuils de bascule sur batterie (ex. 184 V / 264 V), avec la tension actuelle.
- **Prises** : les groupes de prises pilotables (interrupteurs NUT) avec un bouton marche/arrêt.
- **Informations** : chimie de la batterie, type d'onduleur, bip, délais d'arrêt et de redémarrage.
- **Alerte** bien visible quand l'onduleur passe sur batterie (avec l'autonomie restante), en cas de surcharge ou quand la batterie est à remplacer.

Les éléments dont l'onduleur ne fournit pas la mesure sont simplement masqués.

## Installation

### Avec HACS (recommandé)

1. Dans HACS, menu **⋮** → **Dépôts personnalisés**.
2. Ajoutez `https://github.com/Marlboro62/onduleur-ups-card` avec le type **Tableau de bord** (Dashboard).
3. Cherchez **Carte Onduleur UPS**, installez-la, puis rechargez la page (Ctrl+F5).

> Tant qu'il n'existe qu'une version bêta, activez **Afficher les versions bêta** dans la fenêtre de téléchargement de HACS.

### Manuellement

1. Téléchargez `onduleur-ups-card.js` depuis les [releases](https://github.com/Marlboro62/onduleur-ups-card/releases) et copiez-le dans `/config/www/`.
2. **Paramètres → Tableaux de bord → ⋮ → Ressources → Ajouter une ressource** :
   - URL : `/local/onduleur-ups-card.js`
   - Type : **Module JavaScript**
3. Rechargez la page (Ctrl+F5).

## Configuration

Avec un seul onduleur NUT, rien à configurer :

```yaml
type: custom:onduleur-ups-card
```

La carte prend le premier onduleur de l'intégration NUT. S'il y en a plusieurs, choisissez l'appareil dans l'**éditeur visuel** (champ `device`).

| Option | Rôle | Défaut |
| --- | --- | --- |
| `device` | Appareil de l'onduleur (intégration NUT) | le premier trouvé |
| `title` | Titre de la carte | nom de l'appareil |
| `show_details` | Afficher la plage secteur et les informations | `true` |
| `theme` | `v2` (bleu nuit MyElectricalData), `auto` (clair ou sombre selon HA), `ha` (thème Home Assistant) | `v2` |
| `entities` | Capteurs choisis à la main (voir ci-dessous) | — |

### Détection des capteurs

La carte retrouve les capteurs de l'appareil d'après leur clé NUT, puis d'après leur nom d'entité, **en anglais comme en français**. Les noms d'entités renommés à la main sont donc reconnus tant qu'ils gardent leur fin habituelle (`…_charge_de_la_batterie`, `…_battery_charge`…).

Si un capteur n'est pas reconnu, ou pour un onduleur qui ne passe pas par NUT, indiquez-le dans `entities:` :

```yaml
type: custom:onduleur-ups-card
title: Onduleur bureau
entities:
  battery_charge: sensor.mon_ups_batterie
  runtime: sensor.mon_ups_autonomie
  load: sensor.mon_ups_charge
  status: sensor.mon_ups_etat
```

| Clé | Capteur |
| --- | --- |
| `status_raw` | Code d'état NUT (`OL`, `OB LB`…) |
| `status` | État en clair (`Online`, `On Battery`…) |
| `battery_charge` | Charge de la batterie (%) |
| `battery_low` | Seuil de batterie faible (%) |
| `runtime` | Autonomie (s, min ou h) |
| `load` | Charge de l'onduleur (%) |
| `realpower` | Puissance réelle (W) |
| `realpower_nominal` | Puissance réelle nominale (W) |
| `power_nominal` | Puissance nominale (VA) |
| `input_voltage`, `output_voltage` | Tensions d'entrée et de sortie |
| `output_voltage_nominal` | Tension de sortie nominale |
| `input_frequency`, `output_frequency`, `output_frequency_nominal` | Fréquences |
| `battery_voltage` | Tension de la batterie |
| `temperature` | Température de l'onduleur ou de la batterie |
| `transfer_low`, `transfer_high` | Seuils de bascule sur batterie |
| `chemistry`, `type`, `beeper` | Chimie, type d'onduleur, état du bip |
| `delay_shutdown`, `delay_start` | Délais d'arrêt et de redémarrage |

Un exemple complet est dans [`exemples/carte-onduleur.yaml`](exemples/carte-onduleur.yaml).

> Beaucoup de capteurs NUT (autonomie, seuils, délais…) sont des capteurs de **diagnostic**, parfois **désactivés par défaut**. Pour qu'ils apparaissent sur la carte, activez-les dans **Paramètres → Appareils → votre onduleur**.

## Support

Questions et problèmes : uniquement via les [issues GitHub](https://github.com/Marlboro62/onduleur-ups-card/issues).

## Voir aussi

- [Carte Enedis Linky New](https://github.com/Marlboro62/content-card-linky-new) · [Carte Linky Appareils](https://github.com/Marlboro62/linky-appareils-card) · [Carte Linky Solaire](https://github.com/Marlboro62/linky-solaire-card)

Si la carte vous est utile : [Buy Me a Coffee](https://buymeacoffee.com/marlboro62) · [Ko-fi](https://ko-fi.com/nothing_one)

## Licence

MIT

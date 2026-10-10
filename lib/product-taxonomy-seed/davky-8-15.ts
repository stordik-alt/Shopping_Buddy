// Seed proposal — batches 8–15: the types promoted to lib/product-types.ts in this round, with the
// subtypes a household could tell apart. Data only; subtypes enter through the candidate review queue.
import { existingType as ex, type SeedType } from './types'

const P = 'Potraviny' as const
const D = 'Drogerie' as const
const K = 'Děti' as const
const H = 'Domácnost' as const

export const DAVKY_8_15: SeedType[] = [
  // --- Nápoje a alkohol ------------------------------------------------------------------------------
  ex('kombucha', 'Kombucha', P, 'Nápoje', 'l', 'příchuť kombuchy', [
    ['Kombucha natur', 'kombucha bez příchuti nebo originální'],
    ['Kombucha ovocná', 'kombucha s ovocnou příchutí'],
    ['Kombucha zázvorová a bylinná', 'kombucha se zázvorem, mátou nebo bylinami'],
  ]),
  ex('nealko-pivo', 'Nealkoholické pivo', P, 'Alkoholické nápoje', 'l', 'styl nealkoholického piva', [
    ['Nealkoholické světlé pivo', 'světlý ležák bez alkoholu'],
    ['Nealkoholické tmavé a řezané pivo', 'tmavé nebo řezané pivo bez alkoholu'],
    ['Nealkoholické pivo s příchutí', 'radler a pivo s ovocnou příchutí bez alkoholu'],
  ]),
  ex('ledove-caje', 'Ledové čaje', P, 'Nápoje', 'l', 'základ ledového čaje', [
    ['Ledový čaj zelený', 'ledový čaj ze zeleného čaje'],
    ['Ledový čaj černý a ovocný', 'ledový čaj z černého čaje nebo ovocný'],
  ]),
  ex('mlecne-napoje', 'Mléčné nápoje', P, 'Mléčné výrobky', 'l', 'příchuť mléčného nápoje', [
    ['Čokoládový mléčný nápoj', 'mléčný nápoj s kakaem nebo čokoládou'],
    ['Ovocný mléčný nápoj', 'mléčný nápoj s ovocnou příchutí'],
    ['Proteinový mléčný nápoj', 'mléčný nápoj se zvýšeným obsahem bílkovin'],
  ]),
  ex('kysane-napoje', 'Kysané mléčné nápoje', P, 'Mléčné výrobky', 'l', 'druh kysaného nápoje', [
    ['Probiotický nápoj', 'jogurtový nebo mléčný nápoj s probiotickou kulturou, např. Actimel'],
    ['Acidofilní mléko', 'kysané mléko s acidofilní kulturou'],
    ['Zakysaný jogurtový nápoj', 'tekutý zakysaný nápoj s příchutí'],
  ]),
  ex('cidery', 'Cidery', P, 'Alkoholické nápoje', 'l', 'příchuť cideru', [
    ['Cider jablečný', 'klasický jablečný cider'],
    ['Cider ovocný', 'cider s hruškou, jahodou nebo jinou příchutí'],
  ]),

  // --- Mléčné výrobky --------------------------------------------------------------------------------
  ex('cerstvy-syr', 'Čerstvý a smetanový sýr', P, 'Mléčné výrobky', 'kg', 'druh čerstvého sýra', [
    ['Smetanový sýr s bylinkami', 'smetanový sýr ochucený bylinkami nebo pažitkou'],
    ['Žervé', 'žervé přírodní i ochucené'],
    ['Mascarpone a ricotta', 'italské čerstvé sýry'],
  ]),
  ex('syr-tvrdy', 'Sýr tvrdý a polotvrdý', P, 'Mléčné výrobky', 'kg', 'druh sýra', [
    ['Čedar', 'cheddar a čedarový sýr'],
    ['Ementál', 'ementál a sýr ementálského typu'],
    ['Uzený sýr', 'přírodní uzený sýr'],
    ['Kozí a ovčí sýr', 'sýr z kozího nebo ovčího mléka'],
  ]),

  // --- Sladkosti, maso, snacky -----------------------------------------------------------------------
  ex('bonboniery', 'Bonboniéry a pralinky', P, 'Sladkosti', 'kg', 'forma pralinek', [
    ['Bonboniéra v krabici', 'dárkové balení pralinek'],
    ['Pralinky jednotlivě', 'pralinky a kuličky v sáčku nebo kostce, např. Lindor, Raffaello'],
  ]),
  ex('dorty-zakusky', 'Dorty a zákusky', P, 'Sladkosti', 'ks', 'forma dezertu', [
    ['Dort', 'celý dort nebo dortík'],
    ['Zákusek', 'jednotlivý zákusek nebo mini zákusky'],
    ['Roláda a cheesecake', 'roláda, cheesecake a podobné krájené dezerty'],
  ]),
  ex('kachna', 'Kachní maso', P, 'Maso a uzeniny', 'kg', 'část kachny', [
    ['Kachna celá', 'celá kachna nebo mini kachna'],
    ['Kachní prsa', 'kachní prsa s kůží i bez'],
    ['Kachní stehna a čtvrtky', 'stehna a čtvrtky'],
  ]),
  ex('susene-maso', 'Sušené maso', P, 'Maso a uzeniny', 'kg', 'druh sušeného masa', [
    ['Hovězí jerky', 'sušené hovězí maso, biltong'],
    ['Sušené vepřové a drůbeží maso', 'sušená krkovice, panenka, krůtí maso'],
  ]),
  ex('tlacenky-jitrnice', 'Tlačenka, jitrnice a jelito', P, 'Maso a uzeniny', 'kg', 'druh výrobku', [
    ['Tlačenka', 'tlačenka světlá i tmavá'],
    ['Jitrnice a jelito', 'jitrnice, jelito, játrovka'],
  ]),
  ex('arasidy', 'Arašídy', P, 'Ořechy, semínka a sušené ovoce', 'kg', 'úprava arašídů', [
    ['Arašídy pražené solené', 'pražené solené arašídy'],
    ['Arašídy pražené nesolené', 'pražené bez soli'],
    ['Ochucené arašídy', 'medové, teriyaki, obalované'],
  ]),
  ex('popcorn', 'Popcorn', P, 'Slané pochutiny', 'kg', 'forma popcornu', [
    ['Popcorn mikrovlnný', 'popcorn k přípravě v mikrovlnné troubě'],
    ['Popcorn hotový', 'hotový solený, sladký nebo máslový popcorn'],
  ]),
  ex('krekry', 'Krekry', P, 'Slané pochutiny', 'kg', 'druh krekrů', [
    ['Sýrové krekry', 'krekry s příchutí sýra'],
    ['Bramborové a obilné krekry', 'krekry z brambor, žita nebo celozrnné'],
  ]),
  ex('slane-tycinky-preclik', 'Preclíky a slané tyčinky', P, 'Slané pochutiny', 'kg', 'tvar slaného pečiva', [
    ['Preclíky', 'preclíky a preclíčky'],
    ['Slané tyčinky a grissini', 'slané tyčinky, grissini, salinis'],
  ]),
  ex('tortilla-chipsy', 'Tortilla chipsy a nachos', P, 'Slané pochutiny', 'kg', 'příchuť', [
    ['Tortilla chipsy solené', 'solené tortilla chipsy a nachos'],
    ['Tortilla chipsy ochucené', 'sýrové, BBQ a jiné příchutě'],
  ]),
  ex('krupky-snacky', 'Křupky', P, 'Slané pochutiny', 'kg', 'příchuť křupek', [
    ['Křupky sýrové a slané', 'sýrové a solené křupky'],
    ['Křupky sladké a dětské', 'křupky s ovocnou příchutí, dětské křupky'],
  ]),

  // --- Hotová jídla, zelenina, těsta -----------------------------------------------------------------
  ex('polevky', 'Polévky', P, 'Lahůdky a hotová jídla', 'kg', 'forma polévky', [
    ['Instantní polévka', 'polévka v pytlíku nebo kelímku k zalití'],
    ['Hotová polévka', 'hotová chlazená nebo sterilovaná polévka'],
    ['Polévka v prášku k vaření', 'prášková polévka k uvaření'],
  ]),
  ex('pizza-hotova', 'Pizza hotová', P, 'Lahůdky a hotová jídla', 'ks', 'druh pizzy', [
    ['Pizza sýrová', 'quattro formaggi, margherita'],
    ['Pizza s uzeninou', 'salámová, šunková, slaninová'],
    ['Pizza zeleninová', 'zeleninová nebo vegetariánská'],
  ]),
  ex('salaty-hotove', 'Hotové saláty', P, 'Lahůdky a hotová jídla', 'kg', 'druh salátu', [
    ['Bramborový salát', 'bramborový salát'],
    ['Salát s majonézou', 'vajíčkový, á la krab, coleslaw'],
    ['Těstovinový a luštěninový salát', 'těstovinový, čočkový, cizrnový'],
  ]),
  ex('sendvice-wrapy', 'Sendviče a wrapy', P, 'Lahůdky a hotová jídla', 'ks', 'forma pokrmu s náplní', [
    ['Sendvič', 'chlazený sendvič'],
    ['Wrap', 'wrap nebo tortilla s náplní'],
    ['Panini', 'panini'],
  ]),
  ex('kvasena-zelenina', 'Kvašená zelenina', P, 'Lahůdky a hotová jídla', 'kg', 'druh kvašené zeleniny', [
    ['Kimchi', 'kimchi'],
    ['Kysané zelí', 'kysané zelí, sauerkraut'],
    ['Kvašené okurky', 'kvašené okurky a další kvašená zelenina'],
  ]),
  ex('instantni-nudle', 'Instantní nudle', P, 'Těstoviny a rýže', 'kg', 'forma', [
    ['Instantní nudlová polévka', 'nudle k zalití v kelímku nebo sáčku'],
    ['Smažené instantní nudle', 'nudle k restování, Maggi z pánve'],
  ]),
  ex('kukurice', 'Kukuřice', P, 'Ovoce a zelenina', 'kg', 'forma', [
    ['Kukuřice cukrová čerstvá', 'čerstvé kukuřičné klasy'],
    ['Kukuřice sterilovaná', 'zrnková kukuřice v nálevu'],
  ]),
  ex('dyne', 'Dýně', P, 'Ovoce a zelenina', 'kg', 'odrůda dýně', [
    ['Dýně hokkaido', 'hokkaido'],
    ['Dýně máslová a muškátová', 'máslová a muškátová dýně'],
    ['Dýně špagetová', 'špagetová dýně'],
  ]),
  ex('spenat', 'Špenát', P, 'Ovoce a zelenina', 'kg', 'forma špenátu', [
    ['Špenát baby', 'baby špenát k salátu'],
    ['Špenát čerstvý svazkový', 'zralý špenát ve svazku'],
  ]),
  ex('cervena-repa', 'Červená řepa', P, 'Ovoce a zelenina', 'kg', 'úprava řepy', [
    ['Červená řepa syrová', 'čerstvá červená řepa'],
    ['Červená řepa předvařená', 'předvařená vakuovaná červená řepa'],
  ]),
  ex('kvetak', 'Květák', P, 'Ovoce a zelenina', 'kg', 'barva květáku', [
    ['Květák bílý', 'bílý květák'],
    ['Květák barevný', 'fialový, oranžový a zelený květák'],
  ]),
  ex('knedliky', 'Knedlíky a noky', P, 'Těstoviny a rýže', 'kg', 'druh', [
    ['Houskové a bramborové knedlíky', 'hotové knedlíky k přílohám'],
    ['Ovocné knedlíky', 'jahodové, meruňkové, švestkové'],
    ['Gnocchi a bramborové noky', 'gnocchi, noky, halušky'],
  ]),
  ex('testo', 'Těsto', P, 'Mouka a pečení', 'kg', 'druh těsta', [
    ['Listové těsto', 'chlazené nebo mražené listové těsto'],
    ['Těsto na pizzu', 'hotové těsto na pizzu'],
    ['Křehké a kynuté těsto', 'křehké těsto, kynuté těsto'],
  ]),

  // --- Vlasy, tělo, kosmetika ------------------------------------------------------------------------
  ex('barvy-na-vlasy', 'Barvy na vlasy', D, 'Kosmetika', 'ks', 'typ barvy', [
    ['Permanentní barva na vlasy', 'trvalá krémová barva'],
    ['Tónovací barva a pěna', 'tónovací barva, pěnová barva'],
  ]),
  ex('vlasova-pece', 'Vlasová péče', D, 'Kosmetika', 'ks', 'forma vlasové péče', [
    ['Kondicionér', 'kondicionér po mytí'],
    ['Maska na vlasy', 'intenzivní maska'],
    ['Olej a sérum na vlasy', 'vlasový olej, sérum, elixír'],
  ]),
  ex('styling-vlasy', 'Stylingové přípravky na vlasy', D, 'Kosmetika', 'ks', 'druh stylingu', [
    ['Lak na vlasy', 'fixační lak'],
    ['Gel, vosk a pěna', 'gel, vosk, pěnové tužidlo'],
    ['Sprej na vlasy', 'stylingový nebo ochranný sprej'],
  ]),
  ex('telova-pece', 'Tělová péče', D, 'Kosmetika', 'ks', 'forma tělové péče', [
    ['Tělové mléko', 'tělové mléko a lotion'],
    ['Tělový krém a máslo', 'krém, máslo, balzám'],
    ['Tělový olej a sérum', 'olej, sérum, peeling'],
  ]),
  ex('krem-na-ruce', 'Krém na ruce', D, 'Kosmetika', 'ks', 'účel', [
    ['Hydratační krém na ruce', 'běžný krém na ruce'],
    ['Regenerační krém na ruce', 'výživný krém pro suchou pokožku'],
  ]),
  ex('balzam-na-rty', 'Balzám na rty', D, 'Kosmetika', 'ks', 'forma', [
    ['Balzám na rty v tyčince', 'klasický balzám v tyčince'],
    ['Barevný a olejový balzám na rty', 'tónovaný nebo olejový balzám'],
  ]),
  ex('opalovaci-pripravky', 'Opalovací přípravky', D, 'Kosmetika', 'ks', 'použití', [
    ['Opalovací krém a mléko', 'ochranný krém nebo mléko s UV filtrem'],
    ['Přípravek po opalování', 'mléko, gel, sérum po opalování'],
    ['Samoopalovací přípravek', 'samoopalovací mléko, ubrousek'],
  ]),
  ex('odlicovaci-pripravky', 'Odličovací přípravky', D, 'Kosmetika', 'ks', 'forma', [
    ['Micelární voda', 'micelární voda'],
    ['Odličovací mléko a balzám', 'mléko, balzám, olej'],
    ['Odličovací tampony', 'odličovací tampony a ubrousky'],
  ]),
  ex('pece-o-nehty', 'Péče o nehty', D, 'Kosmetika', 'ks', 'druh', [
    ['Pilníky a kleštičky', 'pilníky, kleštičky, nůžky'],
    ['Odlakovač a olej na nehty', 'odlakovač, odlakovací tampony, olej'],
  ]),

  // --- Drogerie, zdraví, doplňky ---------------------------------------------------------------------
  ex('kondomy', 'Kondomy', D, 'Hygiena', 'ks', 'druh', [
    ['Klasické kondomy', 'běžné kondomy'],
    ['Kondomy bez latexu', 'kondomy bez latexu'],
  ]),
  ex('puncochy', 'Punčochové kalhoty', D, 'Doplňky a oblečení', 'ks', 'hustota', [
    ['Punčochové kalhoty tenké', 'do 40 den'],
    ['Punčochové kalhoty silné', 'od 50 den'],
  ]),
  ex('ponozky', 'Ponožky', D, 'Doplňky a oblečení', 'ks', 'určení', [
    ['Dámské ponožky', 'dámské ponožky'],
    ['Pánské a unisex ponožky', 'pánské a unisex ponožky'],
  ]),
  ex('bryle', 'Brýle', D, 'Doplňky a oblečení', 'ks', 'účel', [
    ['Dioptrické brýle na čtení', 'brýle na čtení'],
    ['Sluneční brýle', 'sluneční brýle'],
  ]),
  ex('kontaktni-cocky', 'Kontaktní čočky', D, 'Zdraví a doplňky stravy', 'ks', 'výměna', [
    ['Denní kontaktní čočky', 'jednodenní čočky'],
    ['Měsíční kontaktní čočky', 'měsíční čočky'],
  ]),
  ex('wc-bloky', 'WC bloky a závěsy', D, 'Čištění domácnosti', 'ks', 'forma', [
    ['WC blok do nádržky', 'blok do nádržky'],
    ['WC závěs', 'závěs do mísy'],
  ]),
  ex('rukavice-uklid', 'Rukavice na úklid', H, 'Úklid', 'ks', 'druh', [
    ['Rukavice na mytí', 'gumové a neoprenové rukavice'],
    ['Jednorázové rukavice', 'jednorázové rukavice'],
  ]),
  ex('osvezovace', 'Osvěžovače', D, 'Čištění domácnosti', 'ks', 'forma', [
    ['Osvěžovač vzduchu ve spreji', 'sprej na vzduch'],
    ['Osvěžovač s náplní', 'elektrický osvěžovač a náplň'],
  ]),

  // --- Děti ------------------------------------------------------------------------------------------
  ex('dudliky', 'Dudlíky', K, 'Dětské potřeby', 'ks', 'materiál', [
    ['Silikonový dudlík', 'dudlík ze silikonu'],
    ['Latexový a kaučukový dudlík', 'dudlík z kaučuku'],
  ]),
  ex('detske-lahve', 'Kojenecké lahve', K, 'Dětské potřeby', 'ks', 'věk dítěte', [
    ['Kojenecká lahev', 'lahev pro nejmenší'],
    ['Lahev pro batolata', 'lahev junior'],
  ]),
  ex('kojenecke-mleko', 'Kojenecké mléko', K, 'Kojenecké mléko', 'kg', 'věk dítěte', [
    ['Počáteční kojenecká výživa', 'od narození'],
    ['Pokračovací kojenecká výživa', 'od 6. měsíce'],
    ['Batolecí mléko', 'od 12. měsíce'],
  ]),
]

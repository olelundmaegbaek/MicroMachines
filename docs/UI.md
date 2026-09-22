# Skærmbilleder og HUD

Al tekst i spillet er på dansk. Udtrykket er legende og tegneserieagtigt,
ligesom banen: kraftige farver, runde former, tydelige tal. Intet
simulator-agtigt, ingen telemetri.

Alt HUD ligger som DOM oven på canvas, ikke som geometri i scenen. Det er
skarpere, det koster ingenting at tegne, og det kan skaleres med skærmen uden at
røre kameraet.

## Splitscreen-reglen

Hver spiller har sin egen halvdel og ser kun sine egne tal. Det eneste der
deles er nedtællingen og vinderskærmen, som lægges hen over begge halvdele.

Alt per-spiller HUD skal ligge **inden for sin egen halvdel** og ikke tættere på
delelinjen end at det stadig kan læses. En halvdel er kun cirka 400 px høj på en
bærbar, så der er ikke plads til mere end tre ting.

## De tre ting i hver halvdel

**Omgang**, øverst i det hjørne der vender væk fra delelinjen. Stort tal, lille
etiket: `2/3`. Når sidste omgang begynder, skifter den til `SIDSTE OMGANG` i et
par sekunder.

**Placering**, ved siden af omgangen. `1.` eller `2.`. Den skal være stor nok
til at ses i øjenkrogen, for den er det eneste der betyder noget undervejs.

**Fart**, nederst i samme hjørne. Mindre, mere diskret. Tallet er kosmetisk og
skal ikke læses, det skal kun bevæge sig.

Bilens navn står kun i bilvalget og på vinderskærmen, ikke under løbet.

## Nedtælling

Tre, to, en, kør. Store tal midt på hele skærmen, ikke per halvdel, så begge
spillere ser det samme øjeblik. Bilerne er låst indtil `KØR!`.

Tallene skal pulse i størrelse, ikke bare skifte. Det er den slags detalje der
gør forskellen mellem et skoleprojekt og noget der føles som et spil.

## Bilvalg

Første skærmbillede. Begge spillere vælger samtidig, hver i sin halvdel, med
venstre og højre. To biler:

**Soba Supreme** · orange-rød · *"Lang næse, stor vinge, og en bagende der
gerne vil ud at køre for sig selv."*

**Porcini 911** · sandfarvet · *"Kort, bred og stædig. Motoren sidder bagi,
og det kan mærkes i svingene."*

Beskrivelserne er smil, ikke statistik. **De to biler kører ens.** Fysikken er
delt, og det skal den blive ved med at være i et to-spiller-spil på ét
tastatur, hvor ingen kan vælge om.

Begge spillere må gerne vælge den samme bil. Så får de hver sin farve, og ingen
bliver skuffet.

Når begge har trykket klar, går der et sekund og så starter nedtællingen.

## Vinderskærm

Hen over hele skærmen. Vinderens bilnavn stort, tiden under, og de tre
omgangstider i en lille liste med den hurtigste fremhævet.

En linje der roser taberen også. Det er et hyggespil til to ved samme bord.

To knapper: **Kør igen** med samme biler, og **Skift bil**. Begge skal kunne
nås med tastaturet alene, for der er ingen mus i et spil man spiller med to
hænder hver.

## Når man falder ud over kanten

Ingen dødsskærm. En kort besked i spillerens egen halvdel: `Hovsa!` mens bilen
falder, og så er den tilbage på banen. Halvandet sekund er lang tid når man
taber, så det skal føles som en spøg og ikke som en straf.

## Hvad der med vilje IKKE er med

Ingen omgangstider undervejs, ingen delta til modstanderen, ingen minikort.
Banen er 271 units lang og man kan se det meste af bordet, så et kort ville
være støj. Og man har ikke tid til at læse tal når man drifter.

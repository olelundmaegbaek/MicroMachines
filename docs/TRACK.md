# Bane 1: "Morgenbordet"

Én bane, tre omgange. Bordet er 130 units bredt (X) og 70 units dybt (Z), med
overfladen i `y = 0`. Vejbredden er 10 units, altså knap seks bilbredder.

## Geometrien er regnet efter, ikke gættet

Midterlinjen er en **superellipse** med fire bevidste udbulninger. Den form er
valgt fordi en lukket superellipse ikke kan krydse sig selv, og fordi dens
krumning kan regnes eksakt. Første udkast var håndsatte kontrolpunkter i en
spline, og det gav både et hjørne med radius 0,6 units, altså et knæk og ikke et
sving, og et sted hvor banen løb ind i sig selv. Begge dele ville først være
opdaget når banen kørte.

Parametrene, som koden skal bruge direkte:

| | |
|---|---|
| halv bredde `a` | 54 |
| halv dybde `b` | 25 |
| eksponent `n` | 2,6 |
| formel | `x = a·s·sign(cos φ)·|cos φ|^(2/n)`, `z = b·s·sign(sin φ)·|sin φ|^(2/n)` |

`s` er en skalafaktor som de fire udbulninger lægger oveni, hver som en gaussisk
klokke i `φ`:

| ved `φ` | bredde | udslag | hvad den gør |
|---|---|---|---|
| −0,60 | 0,50 | −11 % | rampestrækningen skærer hjørnet |
| −1,95 | 0,42 | +10 % | melsporet lægger sig ud mod bagkanten |
| +0,42 | 0,38 | +6 % | tallerken-svinget svinger bredt |
| +2,60 | 0,40 | +7 % | gryde-chikanen buler ud |

Målt på den færdige kurve:

| | |
|---|---|
| omgangslængde | 271,4 units |
| tre omgange ved 32 u/s | ca. 25 sekunder |
| mindste kurveradius | 9,2 ved `x=53,7 z=11,2` |
| fart gennem det skarpeste sving | ca. 16 af 46 units/s |
| mindste afstand fra vejkant til bordkant | 3,3 ved `x=−14,8 z=−26,7` |
| banens afstand til sig selv | 21,1, altså over to vejbredder |
| udstrækning | `x −55,9 … 54,2`, `z −26,7 … 25,1` |

Bemærk hvor den mindste afstand til bordkanten ligger: midt i melsporet. Det er
ikke et tilfælde, det er banens eneste virkelig farlige sted, og det er med
vilje lagt sammen med den dårligste vejgreb.

## Omløbet

Man kører med voksende `φ`. Målstregen ligger ved `φ = 1,20`, altså omkring
`x = +25, z = +24`, så der er hele forkanten at accelerere ned ad.

**1. Startstrækningen** · `φ 1,2 → 2,0` · langs forkanten, mod −X
Den længste lige. Bred og tilgivende, så et løb altid begynder roligt.
Start- og målporten fra legetøjsbanen står over vejen.

**2. Bestik-sliden** · `φ ≈ 2,15` · `x ≈ −35, z ≈ +23`
Gafler, knive og skeer ligger spredt som små bump. De vælter ikke, men de rykker
i styretøjet lige inden chikanen.

**3. Gryde-chikanen** · `φ ≈ 2,6 → 3,4` · `x ≈ −51`
En gryde og en stegepande danner et tæt venstre-højre om bordets venstre ende.
Ingen plads til at være dum, men fuldt muligt at køre rent.

**4. Melsporet** · `φ ≈ 4,0 → 4,6` · langs bagkanten, `z ≈ −26`
En stribe spildt mel hele vejen langs bagkanten. **Greb 0,40.** Bordkanten
ligger 3,3 units fra vejkanten. Det er den korteste vej rundt og det eneste sted
hvor et puf fra modstanderen kan koste hele løbet.

**5. Rampen** · `φ ≈ 5,0` · `x ≈ +22, z ≈ −23`
Et stykke orange legetøjsbane på ben står ovenpå bordet. Man kører op ad et
bakkestykke, får luft over toppen og lander igen på bordpladen. Rampen er
smallere end vejen, så den skal rammes lige på. Man kan ikke falde ned i tomrum
fra rampen, kun ned på bordet igen.

**6. Kaffesøen** · `φ ≈ 5,5` · `x ≈ +38, z ≈ −17`
En væltet kop og en pøl kaffe. **Greb 0,55.** Den ligger lige hvor man lander
fra rampen med fart på, så bagenden går.

**7. Skærebræts-plateauet** · `φ ≈ 6,0` · `x ≈ +49, z ≈ −8`
Vejen kører op på et træskærebræt, ca. 1 unit hævet, med en lille kant man
bumper over på vej op. **Greb 1,05**, altså en anelse bedre end bordpladen.

**8. Tallerken-svinget** · `φ ≈ 0,45` · `x ≈ +52, z ≈ +14`
Banens skarpeste sving, radius 9,2, hele vejen rundt om en middagstallerken der
ligger fladt på bordet. Tallerkenen er en forhindring midt i svinget, ikke bare
pynt. Herfra går det direkte ud på startstrækningen, så den der kommer bedst ud
af tallerkenen har overtaget på den lange lige.

## Regler for banen

- **Otte checkpoints**, ét pr. sektion, placeret ved de `φ`-værdier der står
  ovenfor. De skal passeres i rækkefølge, ellers tæller omgangen ikke. Det
  lukker genvejen hen over midten af bordet.
- **Falder man ud over bordkanten** falder bilen mod gulvet, og efter 1,5
  sekund sættes den tilbage på vejen ved sidste passerede checkpoint, i
  kørselsretningen og med farten sat til nul.
- **Grebs-zoner** er polygoner med en gribefaktor der ganges på bilens sidegreb.
  Bordplade 1,00 · skærebræt 1,05 · kaffe 0,55 · mel 0,40.
- **Bilerne kan skubbe hinanden.** Melsporet og tallerken-svinget er de to
  steder hvor et puf kan sende modstanderen ud over kanten.

## Hvorfor sådan

Micro Machines levede af at banen var et almindeligt bord man kendte, og at
faren var at køre ud over kanten, ikke at ramme en mur. Derfor er der ingen
usynlige vægge: kanten er kanten. Og derfor ligger banens eneste virkelig
farlige sektion klods op ad bagkanten, mens resten har fire til fem units
margin.

Rækkefølgen er bygget som en rytme. Lang lige, små bump, teknisk chikane,
risikabel genvej, hop, glat overraskelse, hævet plateau, skarpt sving, og hjem.
Man skal nå at trække vejret mellem de to steder hvor løbet kan tabes.

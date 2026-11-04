# TTS model coverage — Trench Crusade units

Generated from `data/tts/models.json` (`scripts/map_tts_models.py`). Sources, in preference order:

- `3700111403` — Gannel's Trench Crusade Model Corner
- `3603166284` — Trench Crusade 1.0.2 - Scripted Table

Both mods build a miniature as a base `Custom_Model` with the figure attached as `ChildObjects` (Gannel's: `Custom_Model` children with their own mesh + diffuse; Scripted Table: a `Custom_Assetbundle` child). A candidate's `meshUrl` is therefore the base; the figure is in `parts`. GUIDs repeat inside a save (30 GUIDs in Gannel's are shared by differently named models), so address a model by `modId` + `guid` + `nickname`; `chosenModId` and `chosenNickname` are written next to `chosen` for that reason.

Three `kind: fireteam` rows (`new-antioch/fireteam`, `new-antioch/mamluk-faris-fireteam`, `iron-sultanate/mamluk-faris-fireteam`) are wrapper entries with no model of their own; they carry `members` and are excluded from the counts below (105 rows, 102 model units).

## Coverage per faction

| faction | units | matched | pct |
|---|---:|---:|---:|
| Black Grail (`black-grail`) | 14 | 13 | 92.9 |
| Court of the Seven-Headed Serpent (`court-of-the-seven-headed-serpent`) | 15 | 15 | 100.0 |
| Heretic Legion (`heretic-legion`) | 15 | 15 | 100.0 |
| Iron Sultanate (`iron-sultanate`) | 20 | 13 | 65.0 |
| New Antioch (`new-antioch`) | 19 | 18 | 94.7 |
| Trench Pilgrims (`trench-pilgrims`) | 19 | 18 | 94.7 |
| **Total** | **102** | **92** | **90.2** |

Every chosen model comes from Gannel's Model Corner; the Scripted Table had a candidate for 65 of the 92 matched units and never a unit Gannel's lacked.

## Match reasons

| reason | units |
|---|---:|
| exact | 81 |
| normalised | 2 |
| alias | 9 |
| fuzzy | 0 |

Non-exact choices:

- `black-grail/heralds-of-beelzebub` → "Herald of Beelzebub" (normalised 0.95, bag Black Grail)
- `black-grail/hound-of-the-black-grail` → "Hounds of the Black Grail" (normalised 0.95, bag Black Grail)
- `black-grail/lord-of-tumours` → "Lord of Tumors" (alias 0.9, bag Black Grail)
- `court-of-the-seven-headed-serpent/homunculus` → "Takwin Homunculus" (alias 0.9, bag Iron Sultanate)
- `heretic-legion/chorister` → "Heretic Chorister" (alias 0.9, bag Heretic Legion)
- `heretic-legion/homunculus` → "Takwin Homunculus" (alias 0.9, bag Iron Sultanate)
- `iron-sultanate/yuzbasi-captain` → "Yüzbaşı Captain" (alias 0.9, bag Iron Sultanate)
- `new-antioch/homunculus` → "Takwin Homunculus" (alias 0.9, bag Iron Sultanate)
- `new-antioch/trench-dogs-of-the-red-brigade` → "Attack/Trench Dog" (alias 0.9, bag New Antioch)
- `trench-pilgrims/chieftain` → "Jarl Chieftain" (alias 0.9, bag Trench Pilgrims)
- `trench-pilgrims/homunculus` → "Takwin Homunculus" (alias 0.9, bag Iron Sultanate)

## Unmatched units

| unit | closest nicknames seen (difflib ratio) |
|---|---|
| `black-grail/cradle-thrall` (Cradle Thrall) | Grail Thrall (Black Grail) 0.80; Fly Thrall (Black Grail) 0.70; Praetor (The Court) 0.50 |
| `iron-sultanate/archeologist` (Archeologist) | KoA Chorister (Heretic Legion) 0.56; Jabirian Alchemist (Iron Sultanate) 0.53; Jabirean Alchemist (Iron Sultanate) 0.53 |
| `iron-sultanate/bedu-sharpshooter` (Bedu Sharpshooter) | Field Shrine (Deployables) 0.48; Drowned Chorister (Naval Raiders) 0.47; Swiss Shocktrooper (New Antioch) 0.46 |
| `iron-sultanate/disciple-of-st-roch` (Disciple of St. Roch) | Sniper Priest (New Antioch) 0.44; Keeper of the Shared Cup (Trench Pilgrims) 0.42; Shocktrooper w/ Satchel Charge (New Antioch) 0.42 |
| `iron-sultanate/pairika` (Pairika) | Lady Maria (Misc Models) 0.47; Godrik (Misc Models) 0.46; Praetor (The Court) 0.43 |
| `iron-sultanate/shirdal` (Shirdal) | Silahdar (Iron Sultanate) 0.53; Fly Thrall (Black Grail) 0.47; Sea Hag (Naval Raiders) 0.43 |
| `iron-sultanate/tegmen` (Teğmen) | Yeoman (New Antioch) 0.50; Eileen (Misc Models) 0.50; Stigmatic Nun (Trench Pilgrims) 0.42 |
| `iron-sultanate/zamburak-weapon-platform` ("Zamburak" Weapon Platform) | Raider (Trench Pilgrim) (Trench Pilgrims) 0.44; Jabirean Alchemist (Iron Sultanate) 0.43; Trench Pilgrim (Trench Pilgrims) 0.42 |
| `new-antioch/disciple-of-st-roch` (Disciple of St. Roch) | Sniper Priest (New Antioch) 0.44; Keeper of the Shared Cup (Trench Pilgrims) 0.42; Shocktrooper w/ Satchel Charge (New Antioch) 0.42 |
| `trench-pilgrims/disciple-of-st-roch` (Disciple of St. Roch) | Sniper Priest (New Antioch) 0.44; Keeper of the Shared Cup (Trench Pilgrims) 0.42; Shocktrooper w/ Satchel Charge (New Antioch) 0.42 |

`Cradle Thrall` vs `Grail Thrall` scores exactly 0.80 but is blocked: fuzzy matching never takes a nickname that is another unit's own name. The other nine have nothing in either mod; `Disciple of St. Roch` and `Pairika` are mercenaries with no model in either mod, and the Iron Sultanate gaps (Archeologist, Bedu Sharpshooter, Shirdal, Teğmen, Zamburak) have no nickname anywhere near them. Gannel's Iron Sultanate bag has `Dervish`, `Silahdar`, `Sipahi Automaton Cavalry`, `Master Assassin` and `Assassin Acolyte`, none of which is a unit in our data.

## Alias table

| unit name | TTS nicknames accepted |
|---|---|
| "Zamburak" Weapon Platform | Zamburak |
| Anointed Heavy Infantry | AHI, Annointed Heavy Infantry |
| Chieftain | Jarl Chieftain |
| Chorister | Heretic Chorister |
| Heralds of Beelzebub | Herald of Beelzebub |
| Homunculus | Homonculus, Takwin Homunculus |
| Hound of the Black Grail | Grail Hound, Hounds of the Black Grail |
| Jabirean Alchemist | Jabirian Alchemist |
| Janissary | Jannisary |
| Lieutenant | Lieutennant, Lt |
| Lord of Tumours | Lord of Tumors |
| Mechanized Heavy Infantry | MHI |
| Takwin Homunculus | Homonculus |
| Teğmen | Tegmen, Tegmen Lieutenant |
| Trench Dog | Attack/Trench Dog, Trench Dog/Hellhound |
| Trench Dogs of the Red Brigade | Attack/Trench Dog, Trench Dog |
| Yoke Fiend | Yoke-Fiend |
| Yüzbaşı | Yuzbasi Captain, Yüzbaşı Captain |

Normalisation before any comparison: strip accents, lowercase, non-alphanumerics to spaces, crude singular (trailing `s`). Nickname variants — a parenthetical (`Priestess (castigator)`), a `w/ …` or `on …mm base` suffix, a regional prefix (`KoA`, `Prussian`, `Papal`, `Swiss`, `Vatican`, `Lazarist`, `Naval Raider`), or a `/` list — are matched at a 0.05 penalty and ranked below plain matches. Fuzzy is `difflib` ratio ≥ 0.8, last resort, with the ratio recorded as `matchScore`.

Tie-break order for `chosen`: plain over variant, exact > normalised > alias > fuzzy, score, Gannel's over Scripted Table, the unit's own faction bag, not `Misc Models`, has `parts`, then bag path / nickname / GUID. A mercenary appearing under several factions reuses the first faction's choice (`chosenVia: "mercenary shared choice"`).

## Tokens, dice and counters

| role | mod | guid | kind | nickname | bag | url |
|---|---|---|---|---|---|---|
| activated | 3603166284 | `a3e07f` | Custom_Token | Active | Black Grail Activation Markers | `…5D24970A3042BDF9747BFC7DC74039B64C17BD99/` |
| activated | 3603166284 | `f2a991` | Custom_Token | Active | Court of the Seven-Headed Serpent Activation Markers | `…62EFCEC8605897141AC23B9F8E49A464589B2001/` |
| activated | 3603166284 | `8435a8` | Custom_Token | Active | Generic Activation Markers | `…75472FA5DF4D9A5A79DFCACCF02E6D044B0AB70F/` |
| activated | 3603166284 | `c90fbc` | Custom_Token | Active | Heretic Legion Activation Markers | `…005DCBF2BD729C494E5EC0DA58CF0398ABA447A8/` |
| activated | 3603166284 | `352428` | Custom_Token | Active | New Antioch Activation Markers | `…647EDFF35D1397EC9577768D1913B378FD7F36CB/` |
| activated | 3603166284 | `1dc2c4` | Custom_Token | Active | Sultanate of the Iron Wall Activation Markers | `…E93E2E25F8A724A188A450B906DFAA25E146F085/` |
| activated | 3603166284 | `e04e48` | Custom_Token | Active | Trench Pilgrim Activation Markers | `…AE8CC3A0A475582AAA8BB10EC12569BAC5AF6C1A/` |
| activated | 3700111403 | `3b645a` | Custom_Model_Infinite_Bag | ACTIVATED | — | `…5C391C2599AE5F6972D6EFA7BFC04B41D6E821E3/` |
| activated | 3700111403 | `7c7f58` | Custom_Token | ACTIVATED | — | `…D33FC474E4355D13EBC5BF258D53ECDE24949505/` |
| activated | 3700111403 | `7c7f58` | Custom_Token | ACTIVATED | ACTIVATED | `…D33FC474E4355D13EBC5BF258D53ECDE24949505/` |
| blessing | 3603166284 | `719992` | Custom_Dice | Blessing Marker | Blessing Markers | `…F15B23A3BECD45D441CFF88B4492E2ABD7C9DF10/` |
| blood | 3603166284 | `a4e6d3` | Custom_Dice | Blood Marker | Blood Markers | `…95418D6C064A65DE3427205EC0723FF0E0EB58F6/` |
| counter-glory | 3603166284 | `9458e0` | Custom_Token | Glory | — | `…DE73B64E1B5C6F272EA3BEE5EF458E73E48FF03D/` |
| counter-glory | 3603166284 | `cdcfd8` | Custom_Token | Glory | — | `…DE73B64E1B5C6F272EA3BEE5EF458E73E48FF03D/` |
| counter-points | 3603166284 | `58b28d` | Custom_Token | Points | — | `…DE73B64E1B5C6F272EA3BEE5EF458E73E48FF03D/` |
| counter-points | 3603166284 | `bf846e` | Custom_Token | Points | — | `…DE73B64E1B5C6F272EA3BEE5EF458E73E48FF03D/` |
| counter-turn | 3603166284 | `025fa8` | Custom_Token | Turn | — | `…DE73B64E1B5C6F272EA3BEE5EF458E73E48FF03D/` |
| counter-turn | 3603166284 | `5114af` | Custom_Token | Turn | — | `…DE73B64E1B5C6F272EA3BEE5EF458E73E48FF03D/` |
| dice | 3603166284 | `15d529` | Custom_Token | Trench Crusade Dice Roller | — | `…0C7152AE757578C1D3338E7B38290E5359AA950C/` |
| dice | 3603166284 | `63dad0` | Custom_Token | Trench Crusade Dice Roller | — | `…0C7152AE757578C1D3338E7B38290E5359AA950C/` |
| dice | 3603166284 | `e3a6d5` | Custom_Token | Trench Crusade Dice Roller | — | `…0C7152AE757578C1D3338E7B38290E5359AA950C/` |
| down | 3603166284 | `c00e37` | Custom_Token | — | Down Markers | `…CE161F8C9227B1A2BFA62D23271C5827C5D158B4/` |
| down | 3700111403 | `353d47` | Custom_Model_Infinite_Bag | DOWN | — | `…9AD455F2CBAEC01B2CBCDDB8B6DC4CE48D14B545/` |
| down | 3700111403 | `4f22ce` | Custom_Token | DOWN | — | `…24C85803DEDAC37A297D738EF6610BBC75620B6B/` |
| down | 3700111403 | `4f22ce` | Custom_Token | DOWN | DOWN | `…24C85803DEDAC37A297D738EF6610BBC75620B6B/` |
| objective | 3603166284 | `ef4973` | Custom_Model | Anti-Material Rifle emplacement | Objectives + Tokens | `…419EE16709C5BDDBAFE6A5159DED46C3B22AB62C/` |
| objective | 3603166284 | `a04fe1` | Custom_Model | Machine-Gun Emplacement | Objectives + Tokens | `…419EE16709C5BDDBAFE6A5159DED46C3B22AB62C/` |
| objective | 3603166284 | `bfe2f9` | Custom_Model | Mortar Emplacement | Objectives + Tokens | `…419EE16709C5BDDBAFE6A5159DED46C3B22AB62C/` |
| objective | 3603166284 | `5cf6c5` | Custom_Model | Hell Thick | Objectives + Tokens/Hell Ticks | `…EEFF5DD03F937A5E3A1D9E905EBE5FB2C2FD1920/` |
| objective | 3603166284 | `7b3ebb` | Custom_Model | Mine | Objectives + Tokens/Mine Tokens/Active Mine Tokens with Radius v2 | `…EEFF5DD03F937A5E3A1D9E905EBE5FB2C2FD1920/` |
| objective | 3603166284 | `d70e9c` | Custom_Model | Mine | Objectives + Tokens/Mine Tokens/Dud Mine Tokens with Radius v2 | `…EEFF5DD03F937A5E3A1D9E905EBE5FB2C2FD1920/` |
| objective | 3603166284 | `12eb9c` | Custom_Assetbundle | Objective | Objectives + Tokens/Objective Markers | `…0D54D9828314E4A749E7829475A604F669E9B139/` |
| objective | 3603166284 | `30cf76` | Custom_Assetbundle | Objective | Objectives + Tokens/Objective Markers | `…0D54D9828314E4A749E7829475A604F669E9B139/` |
| objective | 3603166284 | `616d80` | Custom_Assetbundle | Objective | Objectives + Tokens/Objective Markers | `…0D54D9828314E4A749E7829475A604F669E9B139/` |
| objective | 3603166284 | `b2ed6e` | Custom_Assetbundle | Objective | Objectives + Tokens/Objective Markers | `…0D54D9828314E4A749E7829475A604F669E9B139/` |
| objective | 3603166284 | `ba7eaf` | Custom_Assetbundle | Objective | Objectives + Tokens/Objective Markers | `…0D54D9828314E4A749E7829475A604F669E9B139/` |
| objective | 3603166284 | `e2fcce` | Custom_Assetbundle | Objective | Objectives + Tokens/Objective Markers | `…0D54D9828314E4A749E7829475A604F669E9B139/` |
| objective | 3603166284 | `b67c0f` | Custom_Model | Peasant | Objectives + Tokens/Peasants | `…EEFF5DD03F937A5E3A1D9E905EBE5FB2C2FD1920/` |
| objective | 3603166284 | `06e2f2` | Custom_Model | Reliquiaries | Objectives + Tokens/Reliquiaries | `…14A81B6CF88A3BBC61E1FCAB2B0F7E2D787BFDCE/` |
| objective | 3603166284 | `788d6e` | Custom_Model | Reliquiaries | Objectives + Tokens/Reliquiaries | `…CB98239F66ABCC253155E063F8D63E2889B77A6C/` |
| objective | 3603166284 | `7ed338` | Custom_Model | Reliquiaries | Objectives + Tokens/Reliquiaries | `…BB494FAB82E2E1D62F32D171B2744E31C72F2478/` |
| objective | 3603166284 | `891cda` | Custom_Model | Reliquiaries | Objectives + Tokens/Reliquiaries | `…58C0C2A08FEA4F7EF343A0DDFE927EB026D6232E/` |
| objective | 3603166284 | `b18d7e` | Custom_Model | Reliquiaries | Objectives + Tokens/Reliquiaries | `…BB494FAB82E2E1D62F32D171B2744E31C72F2478/` |
| objective | 3603166284 | `d2fe6a` | Custom_Model | Reliquiaries | Objectives + Tokens/Reliquiaries | `…58C0C2A08FEA4F7EF343A0DDFE927EB026D6232E/` |
| objective | 3603166284 | `e1809f` | Custom_Model | Stack of explosives | Objectives + Tokens/Stacks of Explosives | `…EEFF5DD03F937A5E3A1D9E905EBE5FB2C2FD1920/` |
| objective | 3603166284 | `245343` | Custom_Model | Supply Cache | Objectives + Tokens/Supply Caches | `http://pastebin.com/raw/YVmrvRKC` |
| objective | 3603166284 | `dd2543` | Custom_Model | Undetonated Shell | Objectives + Tokens/Undetonated Shell Bag | `…EEFF5DD03F937A5E3A1D9E905EBE5FB2C2FD1920/` |
| objective | 3603166284 | `dd2543` | Custom_Model | Undetonated Shell | Objectives + Tokens/Undetonated Shells | `…EEFF5DD03F937A5E3A1D9E905EBE5FB2C2FD1920/` |
| other | 3603166284 | `88d312` | Custom_Dice | — | Black Grail Dice | `…D374D96248B0ADAFC6E199F4778DF194A66C506E/` |
| other | 3603166284 | `f548a7` | Custom_Dice | — | Court of the Seven-Headed Serpent Dice | `…93CB716BD0D12C0C5CC0E873E718E6C71C897BF6/` |
| other | 3603166284 | `89a6a4` | Custom_Dice | — | Heretic Legion Dice | `…2FB3AD0CC3B94C653745948817A7A041717D368E/` |
| other | 3603166284 | `f7d10b` | Custom_Dice | Infection Marker | Infection Markers | `…109C8BB47723AF6EE8314DED66BD75DEC77B3458/` |
| other | 3603166284 | `b884d7` | Custom_Dice | — | New Antioch Dice | `…DC7E260C7572F0CD3A3FFF618643D0128B042856/` |
| other | 3603166284 | `b4df48` | Custom_Dice | — | Sultanate of the Iron Wall Dice | `…416484E7D413CC28503188E724D11B3D4D997FC1/` |
| other | 3603166284 | `7901f2` | Custom_Dice | — | Trench Pilgrim Dice | `…B862E6613A55C976F17A3E6748DB5A921A265032/` |
| tough | 3603166284 | `956155` | Custom_Token | — | Tough Markers | `…179098A4AE5CA9151B836634E1AF8B57031DC627/` |
| tough | 3700111403 | `03604e` | Custom_Token | TOUGH | — | `…41D89BAAB7474535CD33BFEF6A9527D3F1987BB3/` |
| tough | 3700111403 | `5a8144` | Custom_Model_Infinite_Bag | TOUGH | — | `…9AD455F2CBAEC01B2CBCDDB8B6DC4CE48D14B545/` |
| tough | 3700111403 | `03604e` | Custom_Token | TOUGH | TOUGH | `…41D89BAAB7474535CD33BFEF6A9527D3F1987BB3/` |

Notes on the inventory:

- The Scripted Table's activation markers are per-faction `Infinite_Bag`s whose token has a second state named `Activated`; Gannel's ships one ACTIVATED/DOWN/TOUGH token each, both loose and inside a `Custom_Model_Infinite_Bag` (hence the repeated GUIDs).
- Blood and Blessing markers are `Custom_Dice` in the Scripted Table; there are none in Gannel's.
- `role: other` holds the six faction dice and the Infection Marker.
- `Supply Cache` (`245343`) has a pastebin URL as its mesh in the raw save — copied as found, it will not load as a mesh.
- The dice roller exists three times (`15d529`, `63dad0`, `e3a6d5`); the latter two carry 26 states for alternative backgrounds.

## Spot checks (chosen model vs raw save)

| unit | mod/guid | raw nickname | raw bag | base mesh / figure part |
|---|---|---|---|---|
| `new-antioch/lieutenant` | 3700111403/`15e05f` | Lieutenant | New Antioch | `…BD69B441EBEC20180CA/` / `…08E88D2B8CB1835F061/` |
| `black-grail/trench-dog` | 3700111403/`b1bbbc` | Trench Dog | Trench Pilgrims | `…97581218D526F1A414D/` / `…B3BF04D30FCFF8CB79F/` |
| `iron-sultanate/yuzbasi-captain` | 3700111403/`2516e5` | Yüzbaşı Captain | Iron Sultanate | `…BD69B441EBEC20180CA/` / `…EB36C2A3DD736B56489/` |
| `trench-pilgrims/war-prophet` | 3700111403/`07eeca` | War Prophet | Trench Pilgrims | `…BD69B441EBEC20180CA/` / `…8005ECE0B1DE13BC83A/` |
| `heretic-legion/chorister` | 3700111403/`044fbf` | Heretic Chorister | Heretic Legion | `…BD69B441EBEC20180CA/` / `…99629890866B621E552/` |

All five agree with the raw `ObjectStates` entry on nickname, bag path, base mesh URL, scale and the first child part's mesh and diffuse URLs.

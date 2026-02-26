# Changelog

All notable changes to this project will be documented in this file.

## [1.13.0](https://github.com/xiaofandegeng/rmemo/compare/v1.12.0...v1.13.0) (2026-02-26)


### ✨ Features

* **release:** support current version alias in archive-find ([9429bec](https://github.com/xiaofandegeng/rmemo/commit/9429bec78184f80198e21bf3caeccab607996558))

## [1.12.0](https://github.com/xiaofandegeng/rmemo/compare/v1.11.0...v1.12.0) (2026-02-26)


### ✨ Features

* **release:** add standardized output for preset listing mode ([ffb9f10](https://github.com/xiaofandegeng/rmemo/commit/ffb9f10724be8f87179befa66ab09d4aeee5eada))
* **release:** list built-in archive require presets ([62e5ae1](https://github.com/xiaofandegeng/rmemo/commit/62e5ae1c2d2e1cd7c17005efb858e7a8160b9d14))
* **release:** show archive verify required files in markdown summary ([55e5d01](https://github.com/xiaofandegeng/rmemo/commit/55e5d01671ce03f643419bd9cef30f7c479900a2))


### 🐛 Bug Fixes

* **release:** enforce archive verify flag dependencies ([cb2af1e](https://github.com/xiaofandegeng/rmemo/commit/cb2af1e776e742dc8d1133a2d2cc30c6477b37e4))
* **release:** enforce version guardrails for archive-find checks ([a529cbe](https://github.com/xiaofandegeng/rmemo/commit/a529cbe10b6846a4ef9772ff875743ed0cf2fbbe))
* **release:** reject conflicting flags in preset listing mode ([416cbdd](https://github.com/xiaofandegeng/rmemo/commit/416cbdddc583f4ddc459fcc33df4ab09ab43710f))
* **release:** retain verify baseline on non-json archive verify output ([34cc4d8](https://github.com/xiaofandegeng/rmemo/commit/34cc4d8e19ea81092883d73826703f3f93277558))
* **release:** validate archive-only flags in rehearsal ([983220f](https://github.com/xiaofandegeng/rmemo/commit/983220f732b5fc95d9c3f9c6ca06c93a3645e0af))

## [1.11.0](https://github.com/xiaofandegeng/rmemo/compare/v1.10.0...v1.11.0) (2026-02-26)


### ✨ Features

* **release:** add require preset for archive completeness checks ([c4a7380](https://github.com/xiaofandegeng/rmemo/commit/c4a7380056ac09ba1aa412098a0875a976032bbf))
* **release:** archive markdown summary artifacts ([ff09036](https://github.com/xiaofandegeng/rmemo/commit/ff0903638a30cb5084edda41da2c91c64017c67c))
* **release:** expose archive verify preset in summary outputs ([2e99c00](https://github.com/xiaofandegeng/rmemo/commit/2e99c005c229aa9614f6bf39f94d709a89d9438c))
* **release:** include summary artifact in archive verify defaults ([47da0a6](https://github.com/xiaofandegeng/rmemo/commit/47da0a6ec6770dd1b876da858c3ed08f94c78dc0))
* **release:** support require presets in rehearsal archive verify ([ad830bc](https://github.com/xiaofandegeng/rmemo/commit/ad830bc23b58eb68c8f99474ee33ae9a96541f9d))
* **release:** validate summary format/output suffix consistency ([210fc1f](https://github.com/xiaofandegeng/rmemo/commit/210fc1f8cebf64ffd4039970e993b071ba115757))


### 🐛 Bug Fixes

* **release:** align archive-verify npm script with defaults ([b104f01](https://github.com/xiaofandegeng/rmemo/commit/b104f01b5bee3017301aeb569b5ef38d38670e63))
* **release:** keep json summary compatibility in archive markdown mode ([b2b8595](https://github.com/xiaofandegeng/rmemo/commit/b2b859509e5ce4779348f1caf57d050dcc0403f9))

## [1.10.0](https://github.com/xiaofandegeng/rmemo/compare/v1.9.0...v1.10.0) (2026-02-26)


### ✨ Features

* **release:** enrich markdown summary observability sections ([2b6d5a3](https://github.com/xiaofandegeng/rmemo/commit/2b6d5a3067022e60c5fca58bf6dd34bcd28e1452))

## [1.9.0](https://github.com/xiaofandegeng/rmemo/compare/v1.8.0...v1.9.0) (2026-02-26)


### ✨ Features

* **release:** aggregate downstream step failure codes in rehearsal summary ([3dde114](https://github.com/xiaofandegeng/rmemo/commit/3dde114c9d82a6bc4d5f979173a4eec1794e42a4))
* **release:** expose standardized summary in rehearsal report ([15be698](https://github.com/xiaofandegeng/rmemo/commit/15be69848a8285bfaea027d9045d53229c33105c))
* **release:** show downstream failure signals in rehearsal markdown ([5f92bac](https://github.com/xiaofandegeng/rmemo/commit/5f92bac7a71394d43663a006853b82d11b19798a))
* **release:** support markdown summary output in rehearsal ([d0ff685](https://github.com/xiaofandegeng/rmemo/commit/d0ff685cb64c8fa511687eb4ab43f45477097844))


### 🎯 Testing

* **release:** cover summary-format edge cases in rehearsal ([2bb34ca](https://github.com/xiaofandegeng/rmemo/commit/2bb34cab9d6bfc17d105b54f7be6592b02c3e117))

## [1.8.0](https://github.com/xiaofandegeng/rmemo/compare/v1.7.0...v1.8.0) (2026-02-26)


### ✨ Features

* **release:** add standardized json output for release-notes ([d0f314c](https://github.com/xiaofandegeng/rmemo/commit/d0f314cc95a9fb48a676e491e5f966bc93b6a356))
* **release:** merge health failures into rehearsal standardized summary ([fbc3a3e](https://github.com/xiaofandegeng/rmemo/commit/fbc3a3e594de803c90bd3d4d9178f34eda5d2210))
* **release:** standardize archive report output for integrations ([f26ee5a](https://github.com/xiaofandegeng/rmemo/commit/f26ee5a821fddf027cb1a4c073c43798033237c7))
* **release:** standardize changelog-lint output for integrations ([aee3165](https://github.com/xiaofandegeng/rmemo/commit/aee3165178ad3c3e83a6fd8842df50124f9acb0a))
* **release:** standardize regression-matrix output for integrations ([e84f5ca](https://github.com/xiaofandegeng/rmemo/commit/e84f5ca7c0e3e729c54678aa8df480c73d992e82))
* **release:** standardize release-ready output for integrations ([fe62380](https://github.com/xiaofandegeng/rmemo/commit/fe62380a880eb872b3592960e78073c64ff8d5b0))
* **release:** standardize release-verify output for integrations ([74452e7](https://github.com/xiaofandegeng/rmemo/commit/74452e761ab0edcffdd1c787239e7f1cb3bee71b))

## [1.7.0](https://github.com/xiaofandegeng/rmemo/compare/v1.6.0...v1.7.0) (2026-02-25)


### ✨ Features

* **release:** add standardized block to rehearsal summary ([d9b7273](https://github.com/xiaofandegeng/rmemo/commit/d9b727359cf92090c0f4832c8d1bee94eaecfe43))
* **release:** expose archive verify details in rehearsal summary ([07ed677](https://github.com/xiaofandegeng/rmemo/commit/07ed67764cd5cee286af412b1d3669f9f9192b5c))

## [1.6.0](https://github.com/xiaofandegeng/rmemo/compare/v1.5.0...v1.6.0) (2026-02-25)


### ✨ Features

* **release:** add archive mode to release rehearsal ([5fc42d0](https://github.com/xiaofandegeng/rmemo/commit/5fc42d0bd5113e1db84b01685bd952b19549b163))
* **release:** add archive query command for version and snapshot lookup ([dd5a3e2](https://github.com/xiaofandegeng/rmemo/commit/dd5a3e20e07b54dcc8284b985e55b49f6129a2a2))
* **release:** add archive verify step to rehearsal ([071b929](https://github.com/xiaofandegeng/rmemo/commit/071b929825cb8d28418ab6ea8c73af43c716d874))
* **release:** add failure taxonomy to rehearsal summary ([475828d](https://github.com/xiaofandegeng/rmemo/commit/475828d2dbef5071985652e082042037048f2117))
* **release:** add versioned archive workflow for release reports ([f667b2b](https://github.com/xiaofandegeng/rmemo/commit/f667b2b7d28a9d108b1b5a2c9e1a6c10530ce451))
* **release:** aggregate health failure codes in rehearsal summary ([8d080ed](https://github.com/xiaofandegeng/rmemo/commit/8d080edc18322f723de9e853763d8a79f8a2e545))
* **release:** validate archive snapshot required files ([9bac9f4](https://github.com/xiaofandegeng/rmemo/commit/9bac9f4dea6ba996f8acae96af6991916f34240f))

## [1.5.0](https://github.com/xiaofandegeng/rmemo/compare/v1.4.0...v1.5.0) (2026-02-25)


### ✨ Features

* **release:** add summary-out report for release rehearsal ([24fcab2](https://github.com/xiaofandegeng/rmemo/commit/24fcab257bca9f965ab35bf75deb17396c05a314))
* **release:** standardize release-health output for integrations ([647897b](https://github.com/xiaofandegeng/rmemo/commit/647897bfe78e16150ab80b4a8e0f56be94cca224))


### 📚 Documentation

* **plan:** track v1.4 release merge and pending verification ([690bb71](https://github.com/xiaofandegeng/rmemo/commit/690bb718ebbb74281af3a4adb40f6797567b3024))
* **release:** close v1.4 cycle with dual-visibility verification ([91f1c67](https://github.com/xiaofandegeng/rmemo/commit/91f1c67f108d0aade936cd50cf04da224cc4664e))

## [1.4.0](https://github.com/xiaofandegeng/rmemo/compare/v1.3.2...v1.4.0) (2026-02-25)


### ✨ Features

* **release:** add github api retry strategy to release-health ([0c7b68e](https://github.com/xiaofandegeng/rmemo/commit/0c7b68ecb3e74a03d9fe47519fa2e9142d30fd42))
* **release:** add post-release convergence verify command ([600bd63](https://github.com/xiaofandegeng/rmemo/commit/600bd63a0c111bc62f0d0f4e251810e3197cc4f6))
* **release:** propagate github retry flags in rehearsal and workflow ([828257b](https://github.com/xiaofandegeng/rmemo/commit/828257beb565bf6d16d9ea8ebb7ed1a5f6622fe4))


### 📚 Documentation

* **plan:** add v1.5 pre-research entry and align task portal ([e9951ba](https://github.com/xiaofandegeng/rmemo/commit/e9951ba3b963054244522be327eaed356c58ed31))
* **plan:** bootstrap v1.4 cycle plan and switch task entry ([b4be2ba](https://github.com/xiaofandegeng/rmemo/commit/b4be2badda9d47412ab6689c50109f23faf3074b))
* **release:** codify v1.4 guardrails in runbook and checklist ([a1cef6b](https://github.com/xiaofandegeng/rmemo/commit/a1cef6b464675c560f4036f8bd8fa0f231318c4c))

## [1.3.2](https://github.com/xiaofandegeng/rmemo/compare/v1.3.1...v1.3.2) (2026-02-25)


### 📚 Documentation

* **plan:** calibrate baseline to v1.3.0 and target v1.4.0 ([90eb9fe](https://github.com/xiaofandegeng/rmemo/commit/90eb9fe6529d07bff6aea9dc278215e800c66316))

## [1.3.1](https://github.com/xiaofandegeng/rmemo/compare/v1.3.0...v1.3.1) (2026-02-25)


### 🎯 Testing

* **release:** enforce strict unscoped asset naming in workflow ([070120c](https://github.com/xiaofandegeng/rmemo/commit/070120cbf3c74d6fa68865fb85e9339b9627cf09))

## [1.3.0](https://github.com/xiaofandegeng/rmemo/compare/v1.2.3...v1.3.0) (2026-02-25)


### ✨ Features

* **release:** validate expected tgz asset in release-health ([64c0411](https://github.com/xiaofandegeng/rmemo/commit/64c041148f49bd7ba097f33e4744ef6d52cfc5e8))


### 🐛 Bug Fixes

* **release:** upload unscoped tgz asset name to GitHub release ([022cc7a](https://github.com/xiaofandegeng/rmemo/commit/022cc7a8738a03b287138249b8bcba1eb0112cb4))


### 📚 Documentation

* **release:** document step-timeout usage in readiness flow ([37fcdaf](https://github.com/xiaofandegeng/rmemo/commit/37fcdaf94d697bc6fffd175d2f1fe6fb7edecb34))

## [1.2.3](https://github.com/xiaofandegeng/rmemo/compare/v1.2.2...v1.2.3) (2026-02-25)


### 🐛 Bug Fixes

* **release:** add per-check timeout control in release-ready ([be1fd1b](https://github.com/xiaofandegeng/rmemo/commit/be1fd1b2e7d9b76b6a304c8a7b9c7164b716eb12))

## [1.2.2](https://github.com/xiaofandegeng/rmemo/compare/v1.2.1...v1.2.2) (2026-02-25)


### 🎯 Testing

* **release:** cover release-ready network failure reporting ([31e0b89](https://github.com/xiaofandegeng/rmemo/commit/31e0b89af5c4b49b63c8f8a5cc6ecc048fca2672))

## [1.2.1](https://github.com/xiaofandegeng/rmemo/compare/v1.2.0...v1.2.1) (2026-02-25)


### 🐛 Bug Fixes

* **release:** add network timeouts to rehearsal health checks ([208f0dc](https://github.com/xiaofandegeng/rmemo/commit/208f0dc8c99944ebaf2fba1ca7eca3b83b97814c))


### 📚 Documentation

* **plan:** sync cycle status after v1.2.0 release ([3415691](https://github.com/xiaofandegeng/rmemo/commit/34156917635db47cec602d2f00ca69a4e9134a81))


### 🎯 Testing

* **release:** cover timeout branches in health and rehearsal scripts ([6bdf4e7](https://github.com/xiaofandegeng/rmemo/commit/6bdf4e719823757fa8613ffa2de3059ee2b7137d))

## [1.2.0](https://github.com/xiaofandegeng/rmemo/compare/v1.1.0...v1.2.0) (2026-02-25)


### ✨ Features

* **changelog:** add changelog lint gate and enforce release heading hygiene ([8ff9fbb](https://github.com/xiaofandegeng/rmemo/commit/8ff9fbbadaae716ec9bda406689e1071474fea11))
* **mcp:** expose timeline and resume tools for antigravity ([a4b3603](https://github.com/xiaofandegeng/rmemo/commit/a4b36038135c0547652b2397c29b625f1286b538))
* **release:** add aggregated release readiness gate script ([258ad6d](https://github.com/xiaofandegeng/rmemo/commit/258ad6db6c734d540187a936bee7e0047737ae53))
* **release:** add one-command local release rehearsal ([2dce707](https://github.com/xiaofandegeng/rmemo/commit/2dce707d8c74826a3d27f9f628baccd3bffde807))
* **release:** auto-sync github release notes from changelog ([a54d95e](https://github.com/xiaofandegeng/rmemo/commit/a54d95efd9db7d116514ee834e5292ff6f80779c))
* **resume:** add digest command and mcp tool ([c7c3605](https://github.com/xiaofandegeng/rmemo/commit/c7c3605a9ea9aa0f48a39cbf00abae9631b10959))
* **resume:** add history prune across cli/http/mcp and enforce contract drift gate ([5b75445](https://github.com/xiaofandegeng/rmemo/commit/5b7544521a58ba9baaa781515c467e7892fe7ed0))
* **resume:** add next-day resume pack command ([a0198dd](https://github.com/xiaofandegeng/rmemo/commit/a0198dd29b79cc4d91423cbbe2d18523998b3f0f))
* **resume:** add snapshot history across cli/http/mcp ([7bf2f4e](https://github.com/xiaofandegeng/rmemo/commit/7bf2f4eb268abd92b62d96b7155ead888225f8f2))
* **serve:** add resume digest endpoint and watch digest events ([49f2467](https://github.com/xiaofandegeng/rmemo/commit/49f246781b50644d8ef6313a421aeeb993de5bbd))
* **serve:** add timeline and resume http/ui endpoints ([864dfd5](https://github.com/xiaofandegeng/rmemo/commit/864dfd555b14f4cdf2caa0df1b6310bb183a903f))
* **timeline:** add chronological project memory timeline command ([fd69483](https://github.com/xiaofandegeng/rmemo/commit/fd69483e645dd65ae23f12201cc4cb948e911352))
* **ui:** add resume history panel and actions ([b7a43d2](https://github.com/xiaofandegeng/rmemo/commit/b7a43d2c626fe9c4ff90a170e8096f61fa321260))
* **ui:** add resume history prune controls and live event handling ([a59ff7d](https://github.com/xiaofandegeng/rmemo/commit/a59ff7d67d07d781dfaf1414a87f06b47db2da05))


### 🐛 Bug Fixes

* **ci:** retry release-please on transient GitHub failures ([757a874](https://github.com/xiaofandegeng/rmemo/commit/757a874c6c268ea8ab81154f097e5817c4682bbe))
* **resume:** validate prune params and return bad request on invalid input ([8eed842](https://github.com/xiaofandegeng/rmemo/commit/8eed8423f7aa68bec974809130c15e5ac474d71b))


### 📚 Documentation

* **mcp:** list resume history prune write tool in readmes ([49c4fd1](https://github.com/xiaofandegeng/rmemo/commit/49c4fd1cc4c0816f222b8a8523e81654abb2dd91))
* **plan:** record v1.2 pre-dev progress and current focus snapshot ([3054693](https://github.com/xiaofandegeng/rmemo/commit/30546933d43f30f8d57558d6bc6c883a509ab2ef))
* **release:** align runbook with release-please pipeline ([836d0a7](https://github.com/xiaofandegeng/rmemo/commit/836d0a7f55a888287ced52813fa2b9bcf943374a))
* **ui:** clarify resume history prune constraints and update panel hint ([834cdc8](https://github.com/xiaofandegeng/rmemo/commit/834cdc8ef0ba845deebde32cdc89351cddf9b1b2))


### 🎯 Testing

* **resume:** cover invalid prune input in cli and mcp ([e83b704](https://github.com/xiaofandegeng/rmemo/commit/e83b704c93252dc1b61ec286ce4815ecd34ec571))
* **serve:** assert resume history prune emits sse event ([dba1036](https://github.com/xiaofandegeng/rmemo/commit/dba10369db14376ac37a8c98188b2fba3a946858))

## [1.1.0](https://github.com/xiaofandegeng/rmemo/compare/v1.0.0...v1.1.0) (2026-02-22)


### ✨ Features

* **contract:** add contract check with snapshots and fail policies ([5f9cf3a](https://github.com/xiaofandegeng/rmemo/commit/5f9cf3af6116c99cd2373dc868d65b450482270e))
* **release:** add regression matrix and release health verification ([8142287](https://github.com/xiaofandegeng/rmemo/commit/8142287d851b4a702170860c0a3f1e559042cf55))


### 📚 Documentation

* **plan:** align v1.1 cycle status and archive legacy plans ([361d799](https://github.com/xiaofandegeng/rmemo/commit/361d7993bf88fb482f6d908fb2f28f775c26949b))

## [1.0.0](https://github.com/xiaofandegeng/rmemo/compare/v0.37.3...v1.0.0) (2026-02-22)


### 🧹 Chores

* trigger release-please for v1.0.0 ([c9d0995](https://github.com/xiaofandegeng/rmemo/commit/c9d09957876e5ba3b5ae1e19e98d946ed19927b4))
* trigger release-please for v1.0.0 ([7a081e6](https://github.com/xiaofandegeng/rmemo/commit/7a081e68a1266cd13ed8470750c1eb703ff66990))

## [0.37.3](https://github.com/xiaofandegeng/rmemo/compare/v0.37.2...v0.37.3) (2026-02-21)


### 📚 Documentation

* add v1.0 chapter with completion audit and release gates ([36c7d46](https://github.com/xiaofandegeng/rmemo/commit/36c7d467e391731bb6bda9d78f058c34dacc9c20))

## [0.37.2](https://github.com/xiaofandegeng/rmemo/compare/v0.37.1...v0.37.2) (2026-02-21)


### 📚 Documentation

* add v1.0.0 stability contract and migration guide ([d5e0f09](https://github.com/xiaofandegeng/rmemo/commit/d5e0f09d88a4fcfd84386ba7eecb13eff7759799))


### 🧹 Chores

* freeze master plan checkboxes ([923157a](https://github.com/xiaofandegeng/rmemo/commit/923157a3d3868e4ed0f3291cbfc909947f299665))
* prepare for v1.0.0 stability contract release ([b8705e8](https://github.com/xiaofandegeng/rmemo/commit/b8705e8f01ec464adaf20f60b52782f4c2179e3d))

## [0.37.1](https://github.com/xiaofandegeng/rmemo/compare/v0.37.0...v0.37.1) (2026-02-21)


### 📚 Documentation

* add release runbook ([1b118be](https://github.com/xiaofandegeng/rmemo/commit/1b118be93350118d5f9d33918c4cb6fd56c2d95e))


### 🧹 Chores

* consolidate publishing pipeline to release-please ([71fbd8b](https://github.com/xiaofandegeng/rmemo/commit/71fbd8bb9845f3d0ffb6b1d4f042518c30e09118))


### 🎯 Testing

* remove stray merge marker from workspaces.test.js ([6b2697a](https://github.com/xiaofandegeng/rmemo/commit/6b2697a35a0a1fa545295d60f2c7e6329eb42b22))

## [0.37.0](https://github.com/xiaofandegeng/rmemo/compare/v0.36.0...v0.37.0) (2026-02-20)


### Features

* add diagnostics export with cli/http/mcp integration ([52fb3fe](https://github.com/xiaofandegeng/rmemo/commit/52fb3fe4de8644ed19fa147f6533a93061eeb12f))
* implement governance policy templating (v0.37.0) ([d65eb7b](https://github.com/xiaofandegeng/rmemo/commit/d65eb7b9f6c3517490016c476f9dfd3b2f7bf292))
* **ws:** implement persistent action job queue and execution manager ([a401496](https://github.com/xiaofandegeng/rmemo/commit/a401496056ac02c0beddfd6e0a69f6d9feab6d7d))

## [0.36.0](https://github.com/xiaofandegeng/rmemo/compare/v0.35.0...v0.36.0) (2026-02-20)


### Features

* idempotent pulse application and dedupe windowing ([49184f6](https://github.com/xiaofandegeng/rmemo/commit/49184f6dafb31913039b77dad1a35d8c1b8c2beb))

## [0.35.0](https://github.com/xiaofandegeng/rmemo/compare/v0.34.0...v0.35.0) (2026-02-20)


### Features

* add board pulse plan/apply and next-cycle handoff plan ([9393092](https://github.com/xiaofandegeng/rmemo/commit/93930927701eaf89dafe1166582a0839645ff2ca))

## [0.34.0](https://github.com/xiaofandegeng/rmemo/compare/v0.33.0...v0.34.0) (2026-02-18)


### Features

* add alerts board pulse sla and incident history ([27a99f1](https://github.com/xiaofandegeng/rmemo/commit/27a99f14d0c59290c5ebc128fe3f667e15dabe72))

## [0.33.0](https://github.com/xiaofandegeng/rmemo/compare/v0.32.0...v0.33.0) (2026-02-18)


### Features

* add action board lifecycle report and close workflows ([e446e6d](https://github.com/xiaofandegeng/rmemo/commit/e446e6d3e52f609b4f76ccd4f4612bba51c223b6))

## [0.32.0](https://github.com/xiaofandegeng/rmemo/compare/v0.31.0...v0.32.0) (2026-02-18)


### Features

* add alerts action board across cli api mcp and ui ([55afc3d](https://github.com/xiaofandegeng/rmemo/commit/55afc3d9acfeadfb820d926911494234884af01f))

## [0.31.0](https://github.com/xiaofandegeng/rmemo/compare/v0.30.0...v0.31.0) (2026-02-17)


### Features

* add alerts action plans with apply workflow ([3c81aae](https://github.com/xiaofandegeng/rmemo/commit/3c81aae4a523fa0912df06f67a22de85b335c5ee))

## [0.30.0](https://github.com/xiaofandegeng/rmemo/compare/v0.29.0...v0.30.0) (2026-02-17)


### Features

* add workspace alert timeline and RCA pack ([9aa006e](https://github.com/xiaofandegeng/rmemo/commit/9aa006e746ad61890f5329a260cc0758d6e175dd))

## [0.29.0](https://github.com/xiaofandegeng/rmemo/compare/v0.28.0...v0.29.0) (2026-02-17)


### Features

* **ws:** add trend alerts with configurable policy and governance hook ([6354296](https://github.com/xiaofandegeng/rmemo/commit/6354296b8f71ef9221992b52366816a54be9249c))

## [0.28.0](https://github.com/xiaofandegeng/rmemo/compare/v0.27.0...v0.28.0) (2026-02-17)


### Features

* **ws:** add trend board across CLI/HTTP/MCP/UI ([e6d3df4](https://github.com/xiaofandegeng/rmemo/commit/e6d3df4822c29b6042981b5d9eb50a7c8a04afcd))

## [0.27.0](https://github.com/xiaofandegeng/rmemo/compare/v0.26.0...v0.27.0) (2026-02-17)


### Features

* **ws:** persist drift reports and add report history APIs/tools ([0578944](https://github.com/xiaofandegeng/rmemo/commit/0578944e0efbc46c351b6af733b37e731121b13e))

## [0.26.0](https://github.com/xiaofandegeng/rmemo/compare/v0.25.0...v0.26.0) (2026-02-16)


### Features

* add workspace focus snapshots and drift comparison ([853fd5f](https://github.com/xiaofandegeng/rmemo/commit/853fd5f26dfd1f4c9721cced021a16cfecded172))
* **ws:** add workspace focus drift report across CLI/HTTP/MCP/UI ([8739f94](https://github.com/xiaofandegeng/rmemo/commit/8739f941a61809f36e76e070993ddd9292e70699))

## [0.25.0](https://github.com/xiaofandegeng/rmemo/compare/v0.24.0...v0.25.0) (2026-02-16)


### Features

* add workspace hub panel to UI for ws list and focus ([645938a](https://github.com/xiaofandegeng/rmemo/commit/645938ad8d0192a65b5f488a41832d8081ae8b8e))

## [0.24.0](https://github.com/xiaofandegeng/rmemo/compare/v0.23.0...v0.24.0) (2026-02-16)


### Features

* add cross-workspace focus APIs for serve and MCP ([8a565db](https://github.com/xiaofandegeng/rmemo/commit/8a565dbfd63f1a2dc56fb0914dc82240fc23a0ef))

## [0.23.0](https://github.com/xiaofandegeng/rmemo/compare/v0.22.0...v0.23.0) (2026-02-16)


### Features

* add cross-workspace focus for monorepo orchestration ([77a402b](https://github.com/xiaofandegeng/rmemo/commit/77a402b934b029a2475693bab8bbe567c2dcae98))
* add governance benchmark auto-adopt across API MCP and UI ([e03ea18](https://github.com/xiaofandegeng/rmemo/commit/e03ea1867dea8e71c3a89e0eb9fdc207c3eeb562))

## [0.22.0](https://github.com/xiaofandegeng/rmemo/compare/v0.21.0...v0.22.0) (2026-02-16)


### Features

* add governance benchmark replay and ranking ([35e8b27](https://github.com/xiaofandegeng/rmemo/commit/35e8b270a8d29e401688e8d8c8a02a0255a6de8a))
* add governance policy simulator and impact preview ([c720040](https://github.com/xiaofandegeng/rmemo/commit/c72004006223759023b870ed343cf8c0aba58cf4))

## [0.21.0](https://github.com/xiaofandegeng/rmemo/compare/v0.20.0...v0.21.0) (2026-02-16)


### Features

* add governance policy versioning and rollback ([5500305](https://github.com/xiaofandegeng/rmemo/commit/5500305648756e50a84e2c763092c5b7d2c6cd78))

## [0.20.0](https://github.com/xiaofandegeng/rmemo/compare/v0.19.0...v0.20.0) (2026-02-16)


### Features

* add auto-governance engine for embed jobs ([8c0c233](https://github.com/xiaofandegeng/rmemo/commit/8c0c233df7f2f60deab0e4835675ea25002b8858))

## [0.19.0](https://github.com/xiaofandegeng/rmemo/compare/v0.18.0...v0.19.0) (2026-02-16)


### Features

* task governance v2 for embeddings jobs ([1a972a8](https://github.com/xiaofandegeng/rmemo/commit/1a972a823b6e152b08868e125f29c3c7619bb87b))

## [0.18.0](https://github.com/xiaofandegeng/rmemo/compare/v0.17.0...v0.18.0) (2026-02-16)


### Features

* embeddings job orchestration (priority retry concurrency) ([8edd3be](https://github.com/xiaofandegeng/rmemo/commit/8edd3beb8575b5bc1c4c6df13fe460813003edbc))

## [0.17.0](https://github.com/xiaofandegeng/rmemo/compare/v0.16.0...v0.17.0) (2026-02-16)


### Features

* accelerate embeddings build with progress events ([59f1f92](https://github.com/xiaofandegeng/rmemo/commit/59f1f9239c708f71a9581202a71c2e016129f150))
* embeddings background job queue for workbench and mcp ([f218b2c](https://github.com/xiaofandegeng/rmemo/commit/f218b2c6fd8332244b338ffefb4fab89423213f4))

## [0.16.0](https://github.com/xiaofandegeng/rmemo/compare/v0.15.0...v0.16.0) (2026-02-16)


### Features

* embeddings build plan across cli/http/mcp/ui ([9c079ab](https://github.com/xiaofandegeng/rmemo/commit/9c079abe6d17cb1610f25ce32ca4c97be9085708))

## [0.15.0](https://github.com/xiaofandegeng/rmemo/compare/v0.14.0...v0.15.0) (2026-02-16)


### Features

* diagnostics bundle export (status/watch/events) ([161c435](https://github.com/xiaofandegeng/rmemo/commit/161c435652b1f90ee722e143bae82b9e312eee49))
* embeddings ops surface (status/build) across cli/http/mcp/ui ([0e64b5c](https://github.com/xiaofandegeng/rmemo/commit/0e64b5c190fbb5fb534459bea86feb0f0a39a693))

## [0.14.0](https://github.com/xiaofandegeng/rmemo/compare/v0.13.0...v0.14.0) (2026-02-16)


### Features

* observability loop (watch metrics + events export) ([97de17a](https://github.com/xiaofandegeng/rmemo/commit/97de17a737718df7e5ab629a68cf30fac8237812))

## [0.13.0](https://github.com/xiaofandegeng/rmemo/compare/v0.12.0...v0.13.0) (2026-02-15)


### Features

* workbench watch control panel ([b438ebc](https://github.com/xiaofandegeng/rmemo/commit/b438ebc26bcacbf59b7f02c1910fbaf52b40a571))

## [0.12.0](https://github.com/xiaofandegeng/rmemo/compare/v0.11.0...v0.12.0) (2026-02-15)


### Features

* ui refresh repo memory button ([dbe76c7](https://github.com/xiaofandegeng/rmemo/commit/dbe76c7d5f619b229248fffb78cbb3131c212b9c))

## [0.11.0](https://github.com/xiaofandegeng/rmemo/compare/v0.10.0...v0.11.0) (2026-02-15)


### Features

* persistent workbench (sse resume + watch status + refresh api) ([2051cd7](https://github.com/xiaofandegeng/rmemo/commit/2051cd75c5769330c5e36d325a89edf00ec8db46))

## [0.10.0](https://github.com/xiaofandegeng/rmemo/compare/v0.9.0...v0.10.0) (2026-02-15)


### Features

* serve watch mode + sse events ([67385f0](https://github.com/xiaofandegeng/rmemo/commit/67385f0d92da9b304de9e5c79221b4dd2abe59de))

## [0.9.0](https://github.com/xiaofandegeng/rmemo/compare/v0.8.0...v0.9.0) (2026-02-15)


### Features

* integrate snippets + doctor ([c591125](https://github.com/xiaofandegeng/rmemo/commit/c591125c03857eca8fefbc13c441f89676cb12bf))
* integrate supports multiple clients and apply ([eb27789](https://github.com/xiaofandegeng/rmemo/commit/eb27789a21ad8168f1b183c865c92cadcb820544))

## [0.8.0](https://github.com/xiaofandegeng/rmemo/compare/v0.7.0...v0.8.0) (2026-02-15)


### Features

* mcp write tools (allow-write) ([a10c6a8](https://github.com/xiaofandegeng/rmemo/commit/a10c6a8dd9dcf09aed7ba1a3908a02a3ef35c478))
* serve workbench write endpoints ([0598bb3](https://github.com/xiaofandegeng/rmemo/commit/0598bb3a3b46f750dc0bcb2488034c0c88f35f78))

## [0.7.0](https://github.com/xiaofandegeng/rmemo/compare/v0.6.0...v0.7.0) (2026-02-15)


### Features

* serve /ui dashboard ([4caf82f](https://github.com/xiaofandegeng/rmemo/commit/4caf82fecd68991fe0bb1acd370a0087140f4623))

## [0.6.0](https://github.com/xiaofandegeng/rmemo/compare/v0.5.0...v0.6.0) (2026-02-15)


### Features

* focus pack (cli/http/mcp) ([4e883c0](https://github.com/xiaofandegeng/rmemo/commit/4e883c06f8dbe84e870406ddd1e974143321f9c0))
* ws batch embed (auto/check) for monorepos ([60c0d90](https://github.com/xiaofandegeng/rmemo/commit/60c0d902961a8547738fa1d3f12b21f222afb7a2))

## [0.5.0](https://github.com/xiaofandegeng/rmemo/compare/v0.4.0...v0.5.0) (2026-02-15)


### Features

* embed auto + setup/watch integration ([b72f6b0](https://github.com/xiaofandegeng/rmemo/commit/b72f6b0de724d19375a99c36a158620cfe3637ca))

## [0.4.0](https://github.com/xiaofandegeng/rmemo/compare/v0.3.0...v0.4.0) (2026-02-15)


### Features

* embed build --check for up-to-date index ([1c52819](https://github.com/xiaofandegeng/rmemo/commit/1c52819641311c8654674ce25f652b70f6b01065))
* semantic search via embeddings index ([1a857aa](https://github.com/xiaofandegeng/rmemo/commit/1a857aaea0e35095212c528c4c46f335f6c00a33))


### Performance Improvements

* git-aware embeddings reuse across commits ([410a46c](https://github.com/xiaofandegeng/rmemo/commit/410a46c54a0c707c5a1e4751cc6144205153fc80))
* incremental embeddings rebuild with config-aware reuse ([9e2b0e0](https://github.com/xiaofandegeng/rmemo/commit/9e2b0e05c38df1620a18cacb72188bd6b681affc))

## [0.3.0](https://github.com/xiaofandegeng/rmemo/compare/v0.2.0...v0.3.0) (2026-02-14)


### Features

* add MCP stdio server ([b58c263](https://github.com/xiaofandegeng/rmemo/commit/b58c2634d623513a8054d217161e0ee0da974f94))

## [0.2.0](https://github.com/xiaofandegeng/rmemo/compare/v0.1.0...v0.2.0) (2026-02-14)


### Features

* add profile check/upgrade ([d3254b5](https://github.com/xiaofandegeng/rmemo/commit/d3254b5a8e2ad5fe93f756fa2f088f19a3cd9eef))
* add rmemo serve (local http api) ([c478293](https://github.com/xiaofandegeng/rmemo/commit/c4782930b1606e3cf73226049f99dcee41e31454))
* add session workflow ([8e3ea85](https://github.com/xiaofandegeng/rmemo/commit/8e3ea85f98b0cad67000a2b8a4bc5f6a375a199d))
* workspace batch mode (ws batch) ([2f50fb1](https://github.com/xiaofandegeng/rmemo/commit/2f50fb105ad36c618e5a1a8dc8185e4c143d8151))

## 0.0.3

- Publish scoped package `@xiaofandegeng/rmemo` via GitHub Actions.
- Add templates and `init --template` for bootstrapping `.repo-memory/`.

## 0.0.2

- Add `check --staged` (pre-commit optimized) and read staged content from git index.
- Add release workflow hardening and docs around release.

## 0.0.1

- Initial public release.
- Core commands: init/scan/context/print/log/status/check/hook/start/done/todo.

// ==UserScript==
// @name         Evolve
// @namespace    http://tampermonkey.net/
// @version      3.2.1.38
// @description  try to take over the world!
// @downloadURL  https://gist.github.com/Vollch/b1a5eec305558a48b7f4575d317d7dd1/raw/evolve_automation.user.js
// @author       Fafnir
// @author       TMVictor
// @author       Vollch
// @match        https://tmvictor.github.io/Evolve-Scripting-Edition/
// @grant        none
// @require      https://code.jquery.com/jquery-3.4.1.min.js
// @require      https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// ==/UserScript==
//
// This script will NOT WORK WITH THE ORIGINAL VERSION OF THE GAME. It will only work with the scripting edition which can be found at:
// https://tmvictor.github.io/Evolve-Scripting-Edition/
//
// This script forked from TMVictor's script version 3.2.1. Original script: https://gist.github.com/TMVictor/3f24e27a21215414ddc68842057482da
//
// Changes from original version:
//   Remade autoBuild, all buildings now can have individual weights, plus dynamic coefficients to weights(like, increasing weights of power plants when you need more energy), plus additional safe-guards checking for resource usage, available support, and such. You can fine-tune script to build what you actually need, and save resources for further constructions.
//   Remade autoSmelter, now it tries to balance iron and steel income to numbers where both of resources will be full at same time(as close to that as possible). Less you have, more time it'll take to fill, more smelters will be reassigned to lacking resource, and vice versa.
//   Remade autoCraftsmen, it assigns all crafters to same resource at once, to utilize apprentice bonus, and rotates them between resources aiming to desired ratio of stored resources
//   Slightly tuned pre-mad autoCraft, so it won't use resources such greedy, as it used to do. You'll still have resources for everything you need, you just won't stuck with hundreds of thousands of plywood... and no lumber to build university.
//   Remade autoStorage, it calculates required storages, based on available techs and buildings, and assign storages to make them all affordable. Weighting option is gone as it not needed anymore, just rearrange list to change filling order when storages are scarce. Max crate\containers for individual reources still exist, and respected by adjustments.
//   Required amount of resources also taken in account by autoCraftsmen(they can prioritize what's actually needed), and ARPA got an option("-1" craftables to keep) to keep required amount of craftables, instead of some static number
//   Pre-mad storage limit doesn't completely prevents constructing crates and containers, it just make it work above certain ratio(80%+ steel storage for containers, and more-than-you-need-for-next-library for crates)
//   You can enable buying and selling of same resource at same time, depends on whether you're lacking something, or have a surplus. Works both with regular trade, and routes.
//   Expanded triggers, they got "researched" and "built" conditions, and "build" action. And an option to import missing resources required to perform chosen action. Once condition is met and action is available script will set trade routes for what it missing. It can import steel for crucible, titanium for hunter process, uranium for mutual destruction, and same for buildings - whatever you need.
//   Added option to import resources for queued buildings and researches
//   Reworked fighting\spying. At first glance it have less configurable options now, but range of possible outcomes is wider, and route to them is more optimal. With default settings it'll sabotage, plunder, and then annex all foreign powers, gradually moving from top to bottom of the list, as they becomes weak enough, and then occupy last city to finish unification. By tweaking settings it's possible to configure script to get any unification achievment(annex\purchase\occupy\reject, with or without pacifism).
//   Added basic support for magic universe - managing crystal miners, and autobuilding pylons
//   Added options to configure auto clicking resources. Abusable, works like in original script by default. Spoil your game at your own risk.
//   Added evolution queue. If queue enabled and not empty, settings from top of the list will be applied before next evolution, and then removed from queue. When you add new evolution to queue script stores currently configured race, prestige type, and challenges. Evolution settings can also be edited manualy, and can store any settings, but be very careful doing that, as those data will be imported intro script settings without any validation, except for synthax check.
//   Standalone autoAchievements option is gone. It's now selectable as a race. Conditional races now can be chosen by auto achievments during random evolution. With mass extinction perk conditional races will be prioritized, so you can faster finish with planet's achievments, and move to the next one.
//   Added option to restore backup after evolution, and try another race group, if you got a race who already earned MAD achievement. Not very stable due to game page reload, and chosen implementation. And probably won't get better as i've got mass extinction perk already. Consider it as a mere increased chance to get someting new, if you'll dare to try it. And reset evolution settings if you'll have issues with it.
//   A lot of other small changes all around, optimisations, bug fixes, refactoring, etc. Most certainly added bunch of new bugs :)
//
// And, of course, you can do whatever you want with my changes. Fork further, backport any patches back(no credits required). Whatever.

//@ts-check
(function($) {
    'use strict';
    var settings = JSON.parse(localStorage.getItem('settings')) || {};

    var game = null;

    var speciesProtoplasm = "protoplasm";
    var challengeNoCraft = "no_craft";
    var challengeDecay = "decay";
    var racialTraitCarnivore = "carnivore";
    var racialTraitSoulEater = "soul_eater";
    var racialTraitKindlingKindred = "kindling_kindred";
    var racialTraitIntelligent = "intelligent";
    var racialTraitForge = 'forge';
    var racialTraitHiveMind = "hivemind";
    var racialTraitEvil = "evil";
    var racialTraitSlaver = "slaver";
    var racialTraitCannibalize = "cannibalize";
    var racialTraitCreative = "creative";
    var techFactory = "factory";
    var techSuperstar = "superstar";

    // --------------------

    //#region Class Declarations

    var loggingTypes = {
        special: { id: "special", name: "Specials", settingKey: "log_special", },
        construction: { id: "construction", name: "Construction", settingKey: "log_construction", },
        multi_construction: { id: "multi_construction", name: "Multi-part Construction", settingKey: "log_multi_construction", },
        research: { id: "research", name: "Research", settingKey: "log_research", },
        spying: { id: "spying", name: "Spying", settingKey: "log_spying", },
        attack: { id: "attack", name: "Attack", settingKey: "log_attack", },
        mercenary: { id: "mercenary", name: "Mercenaries", settingKey: "log_mercenary", },
    }

    class GameLog {
        constructor() {
            this._logEnabledSettingKey = "logEnabled";
            this._success = 'success';
            this._warning = 'warning';
        }

        /**
         * @param {{ id: string; name: string; settingKey: string; }} loggingType
         * @param {string} text
         */
        logSuccess(loggingType, text) {
            if (!settings[this._logEnabledSettingKey]) { return; }
            if (!settings[loggingType.settingKey]) { return; }

            game.messageQueue(text, this._success);
        }

        /**
         * @param {{ id: string; name: string; settingKey: string; }} loggingType
         * @param {string} text
         */
        logWarning(loggingType, text) {
            if (!settings[this._logEnabledSettingKey]) { return; }
            if (!settings[loggingType.settingKey]) { return; }

            game.messageQueue(text, this._warning);
        }
    }

    class Multiplier {
        constructor() {
            this._remainder = 0;
        }

        /**
         * @param {number} value
         */
        reset(value) {
            this._remainder = value;
        }

        get remainder() {
            game.keyMap.x100 = false;
            game.keyMap.x25 = false;
            game.keyMap.x10 = false;
            return this._remainder;
        }

        /**
         * @return {boolean}
         */
        setMultiplier() {
            if (this._remainder <= 0) {
                game.keyMap.x100 = false;
                game.keyMap.x25 = false;
                game.keyMap.x10 = false;
                return false;
            }

            if (!game.global.settings.mKeys) {
                // Multiplier disabled? Mkay... Let's take a long road.
                this._remainder -= 1;
            } else if (this._remainder >= 25000) {
                game.keyMap.x100 = true;
                game.keyMap.x25 = true;
                game.keyMap.x10 = true;
                this._remainder -= 25000;
            } else if (this._remainder >= 2500) {
                game.keyMap.x100 = true;
                game.keyMap.x25 = true;
                game.keyMap.x10 = false;
                this._remainder -= 2500;
            } else if (this._remainder >= 1000) {
                game.keyMap.x100 = true;
                game.keyMap.x25 = false;
                game.keyMap.x10 = true;
                this._remainder -= 1000;
            } else if (this._remainder >= 250) {
                game.keyMap.x100 = false;
                game.keyMap.x25 = true;
                game.keyMap.x10 = true;
                this._remainder -= 250;
            } else if (this._remainder >= 100) {
                game.keyMap.x100 = true;
                game.keyMap.x25 = false;
                game.keyMap.x10 = false;
                this._remainder -= 100;
            } else if (this._remainder >= 25) {
                game.keyMap.x100 = false;
                game.keyMap.x25 = true;
                game.keyMap.x10 = false;
                this._remainder -= 25;
            } else if (this._remainder >= 10) {
                game.keyMap.x100 = false;
                game.keyMap.x25 = false;
                game.keyMap.x10 = true;
                this._remainder -= 10;
            } else {
                game.keyMap.x100 = false;
                game.keyMap.x25 = false;
                game.keyMap.x10 = false;
                this._remainder -= 1;
            }

            return true;
        }
    }

    class Job {
        /**
         * @param {string} id
         * @param {string} name
         */
        constructor(id, name) {
            /** @type {{job: string, display: boolean, workers: number, max: number, impact: number, name: string}} job */
            this._nullJob = { job: "nullJob", display: false, workers: 0, max: 0, impact: 0, name: "None" };

            // Private properties
            this._originalId = id;
            this._originalName = name;
            this._vueBinding = "civ-" + this._originalId;
            /** @type {{job: string, display: boolean, workers: number, max: number, impact: number}} job */
            this._definition = null;

            // Settings
            this._settingJobEnabled = "job_" + this._originalId;

            this.autoJobEnabled = true;
            this.priority = 0;

            /** @type {number[]} */
            this.breakpointMaxs = [];

            this.jobOverride = null;
        }

        get definition() {
            if (this.jobOverride !== null) {
                return this.jobOverride.definition;
            }

            // We've already got the definition previously so return it
            if (this._definition !== null) {
                return this._definition;
            }

            // We're in the protoplasm stage of the game so there is no definition yet
            if (game.global.race.species === speciesProtoplasm) {
                return this._nullJob;
            }

            // Get the games job definition if it exists
            if (game.global.civic[this._originalId]) {
                this._definition = game.global.civic[this._originalId];
                return this._definition;
            }

            // We've failed to get the definition
            return this._nullJob;
        }

        get id() {
            if (this.jobOverride !== null) {
                return this.jobOverride.id;
            }

            let definition = this.definition;
            if (definition === this._nullJob) {
                return this._originalId;
            }

            return definition.job;
        }

        get name() {
            if (this.jobOverride !== null) {
                return this.jobOverride.name;
            }

            let definition = this.definition;
            if (definition === this._nullJob) {
                return this._originalName;
            }

            return game.global.civic[this.id].name;
        }

        /**
         * @param {Job} jobOverride
         */
        setJobOverride(jobOverride) {
            this.jobOverride = jobOverride;
        }

        isUnlocked() {
            if (this.jobOverride !== null) {
                return this.jobOverride.isUnlocked();
            }

            return this.definition.display;
        }

        isManaged() {
            if (this.jobOverride !== null) {
                return this.jobOverride.isManaged();
            }

            if (!this.isUnlocked()) {
                return false;
            }

            return settings[this._settingJobEnabled];
        }

        isCraftsman() {
            if (this.jobOverride !== null) {
                return this.jobOverride.isCraftsman();
            }

            // Scripting Edition expose a function, rather than it's result. So we need to actually call it.
            return game.craftCost()[this._originalId] !== undefined;
        }

        get count() {
            if (this.jobOverride !== null) {
                return this.jobOverride.count;
            }

            return this.definition.workers;
        }

        get max() {
            if (this.jobOverride !== null) {
                return this.jobOverride.max;
            }

            let definition = this.definition;

            if (definition.max === -1) {
                return Number.MAX_SAFE_INTEGER;
            }

            return definition.max;
        }

        /**
         * @param {number} breakpoint
         * @param {number} employees
         */
        setBreakpoint(breakpoint, employees) {
            this.breakpointMaxs[breakpoint - 1] = employees;
        }

        /**
         * @param {number} breakpoint
         */
        getBreakpoint(breakpoint) {
            return this.breakpointMaxs[breakpoint - 1];
        }

        /**
         * @param {number} breakpoint
         */
        breakpointEmployees(breakpoint) {
            if (breakpoint < 0 || breakpoint > this.breakpointMaxs.length - 1) {
                return 0;
            }

            let breakpointActual = this.breakpointMaxs[breakpoint];

            // -1 equals unlimited up to the maximum available jobs for this job
            if (breakpointActual === -1) {
                breakpointActual = Number.MAX_SAFE_INTEGER;
            }

            // return the actual workers required for this breakpoint (either our breakpoint or our max, whichever is lower)
            return Math.min(breakpointActual, this.max)
        }

        /**
         * @param {number} count
         */
        addWorkers(count) {
            if (this.jobOverride !== null) {
                return this.jobOverride.addWorkers(count);
            }

            if (!this.isUnlocked()) {
                return false;
            }

            if (count < 0) {
                this.removeWorkers(-1 * count);
            }

            if (this.count + count > this.max) {
                count = this.max - this.count;
            }

            let vue = getVueById(this._vueBinding);
            if (vue !== undefined) {
                state.multiplier.reset(count);
                while (state.multiplier.remainder > 0) {
                    state.multiplier.setMultiplier();
                    vue.add();
                }

                return true;
            }

            return false;
        }

        /**
         * @param {number} count
         */
        removeWorkers(count) {
            if (this.jobOverride !== null) {
                return this.jobOverride.removeWorkers(count);
            }

            if (!this.isUnlocked()) {
                return false;
            }

            if (count < 0) {
                this.addWorkers(-1 * count);
            }

            if (this.count - count < 0) {
                count = this.count;
            }

            let vue = getVueById(this._vueBinding);
            if (vue !== undefined) {
                state.multiplier.reset(count);
                while (state.multiplier.remainder > 0) {
                    state.multiplier.setMultiplier();
                    vue.sub();
                }

                return true;
            }

            return false;
        }

        isDefault() {
            if (this.jobOverride !== null) {
                return this.jobOverride.isDefault();
            }

            if (game.global.civic['d_job']) {
                return game.global.civic.d_job === this.id;
            }

            return false;
        }

        setAsDefault() {
            if (this.jobOverride !== null) {
                return this.jobOverride.setAsDefault();
            }

            if (this.id === 'farmer' || this.id === 'lumberjack' || this.id === 'quarry_worker' || this.id === 'crystal_miner' || this.id === 'scavenger') {
                // Only these jobs can be set as default
                let vue = getVueById(this._vueBinding);
                if (vue !== undefined) {
                    vue.setDefault(this.id);
                    return true;
                }
            }

            return false;
        }
    }

    class CraftingJob extends Job {
        /**
         * @param {string} id
         * @param {string} name
         */
        constructor(id, name, resource) {
            super(id, name);

            this._vueBinding = "foundry";
            this.resource = resource;
        }

        isUnlocked() {
            return game.global.resource[this._originalId].display;
        }

        isManaged() {
            if (!this.isUnlocked()) {
                return false;
            }

            return settings[this._settingJobEnabled];
        }

        isCraftsman() {
            return true;
        }

        get count() {
            return game.global.city.foundry[this._originalId];
        }

        get max() {
            return game.global.civic.craftsman.max;
        }

        /**
         * @param {number} count
         */
        addWorkers(count) {
            if (!this.isUnlocked()) {
                return false;
            }

            if (count < 0) {
                this.removeWorkers(-1 * count);
            }

            let vue = getVueById(this._vueBinding);
            if (vue !== undefined) {
                state.multiplier.reset(count);
                while (state.multiplier.remainder > 0) {
                    state.multiplier.setMultiplier();
                    vue.add(this._originalId);
                }

                return true;
            }

            return false;
        }

        /**
         * @param {number} count
         */
        removeWorkers(count) {
            if (!this.isUnlocked()) {
                return false;
            }

            if (count < 0) {
                this.addWorkers(-1 * count);
            }

            if (this.count - count < 0) {
                count = this.count;
            }

            let vue = getVueById(this._vueBinding);
            if (vue !== undefined) {
                state.multiplier.reset(count);
                while (state.multiplier.remainder > 0) {
                    state.multiplier.setMultiplier();
                    vue.sub(this._originalId);
                }

                return true;
            }

            return false;
        }
    }

    class UnemployedJob extends Job {
        constructor() {
            super("free", "Unemployed");

            this._max = Number.MAX_SAFE_INTEGER;
            this._resource = null;
        }

        isUnlocked() {
            return true;
        }

        isManaged() {
            return true;
        }

        isCraftsman() {
            return false;
        }

        get count() {
            return game.global.civic[this._originalId];
        }

        get max() {
            return this._max;
        }

        /**
         * @param {number} count
         */
        addWorkers(count) {
            return false;
        }

        /**
         * @param {number} count
         */
        removeWorkers(count) {
            return false;
        }

        setAsDefault() {
            let vue = getVueById(this._vueBinding);
            if (vue !== undefined) {
                vue.setDefault();
                return true;
            }

            return false;
        }
    }

    class Action {
        /**
         * @param {string} name
         * @param {string} tab
         * @param {string} id
         * @param {string} location
         */
        constructor(name, tab, id, location, flags) {
            this.name = name;
            this._tab = tab;
            this._id = id;
            this._location = location;
            this._elementId = this._tab + "-" + this.id;
            this.gameMax = Number.MAX_SAFE_INTEGER;
            this.specialId = null;

            this._vueBinding = this._elementId;
            this._definition = null;
            this._instance = null;

            this.autoBuildEnabled = true;
            this.autoStateEnabled = true;
            this._autoMax = -1;

            this._weighting = 100;
            this.weighting = 0;
            this.extraDescription = "";

            this.priority = 0;

            this.consumption = {
                /** @type {{ resource: Resource, initialRate: number, rate: number, }[]} */
                resourceTypes: [],
            };

            /** @type {ResourceRequirement[]} */
            this.resourceRequirements = [];

            this.setupCache();

            this.overridePowered = undefined;

            // Additional flags
            this.is = flags || {};
        }

        get definition() {
            if (this._definition !== null) {
                return this._definition;
            }

            let id = this.specialId === null ? this._id : this.specialId;

            if (location !== null && location !== undefined && this._location != "") {
                this._definition = game.actions[this._tab][this._location][id];
            } else {
                this._definition = game.actions[this._tab][id];
            }

            return this._definition;
        }

        get instance() {
            if (this._instance !== null) {
                return this._instance;
            }

            let id = this.specialId === null ? this._id : this.specialId;
            this._instance = game.global[this._tab][id];

            return this._instance;
        }

        setupCache() {
            this._hashElementId = '#' + this._elementId;
            this._hashButtonElement = this._hashElementId + ' .button';
            this._hashButtonCountElement = this._hashElementId + ' .button .count';
            this._hashWarnElement = this._hashElementId + ' .warn';
            this._hashOnElement = this._hashElementId + ' .on';
            this._hashOffElement = this._hashElementId + ' .off';
        }

        //#region Standard actions

        get id() {
            return this._id;
        }

        get title() {
            let definition = this.definition;
            if (definition !== undefined) {
                return typeof this.definition.title === 'string' ? this.definition.title : this.definition.title();
            }

            // There is no definition...
            return this.name;
        }

        get settingId() {
            return this._elementId;
        }

        get vue() {
            return getVueById(this._vueBinding);
        }

        get autoMax() {
            // We can build unlimited. If there is an auto max set then return that, otherwise return unlimited
            if (this.gameMax === Number.MAX_SAFE_INTEGER) {
                return this._autoMax < 0 ? this.gameMax : this._autoMax;
            }

            // There is a game max. eg. world collider can only be built 1859 times
            return this._autoMax >= 0 && this._autoMax <= this.gameMax ? this._autoMax : this.gameMax;
        }

        set autoMax(value) {
            if (value < 0) value = -1;
            this._autoMax = value;
        }

        isUnlocked() {
            return this.vue !== undefined;
        }

        hasConsumption() {
            return this.definition.hasOwnProperty("powered") || this.consumption.resourceTypes.length > 0;
        }

        get powered() {
            if (this.overridePowered !== undefined) {
                return this.overridePowered;
            }

            if (!this.definition.hasOwnProperty("powered")) {
                return 0;
            }

            //checkPowerRequirements()
            if (this.definition.hasOwnProperty("power_reqs")) {
                let power_reqs = this.definition.power_reqs;
                let isMet = true;
                Object.keys(power_reqs).forEach(function (req){
                    if (!game.global.tech[req] || game.global.tech[req] < power_reqs[req]){
                        isMet = false;
                    }
                });
                if (!isMet) {
                    return 0;
                }
            }

            return this.definition.powered();
        }

        updateResourceRequirements() {
            if (!this.isUnlocked()) {
                return;
            }

            let resourceIndex = 0;
            let newCosts = game.adjustCosts(this.definition.cost);

            Object.keys(newCosts).forEach(resourceName => {
                let testCost = Number(newCosts[resourceName]()) || 0;

                if (this.resourceRequirements.length > resourceIndex) {
                    this.resourceRequirements[resourceIndex].resource = resources[resourceName];
                    this.resourceRequirements[resourceIndex].quantity = testCost;
                } else {
                    this.resourceRequirements.push(new ResourceRequirement(resources[resourceName], testCost));
                }

                resourceIndex++;
            });

            // Remove any extra elements that we have that are greater than the current number of requirements
            while (this.resourceRequirements.length > resourceIndex) {
                this.resourceRequirements.pop();
            }
        }

        /**
         * @param {Action} testAction
         */
        isResourceRequirementConflict(testAction) {
            for (let i = 0; i < this.resourceRequirements.length; i++) {
                for (let j = 0; j < testAction.resourceRequirements.length; j++) {
                    if (this.resourceRequirements[i].resource === testAction.resourceRequirements[j].resource) {
                        return true;
                    }
                }
            }

            return false;
        }

        // Whether the action is clickable is determined by whether it is unlocked, affordable and not a "permanently clickable" action
        isClickable() {
            if (!this.isUnlocked()) {
                return false;
            }

            if (!game.checkAffordable(this.definition, false)) {
                return false;
            }

            if (this.count >= this.gameMax) {
                return false;
            }

            return true;
        }

        /**
         * This is a "safe" click. It will only click if the container is currently clickable.
         * ie. it won't bypass the interface and click the node if it isn't clickable in the UI.
         * @param {number} count
         */
        click(count) {
            if (!this.isClickable()) {
                return false
            }

            let retVal = true;
            let tempRetVal = true;
            let previousCount = this.count;

            // Not using state.multiplier here as there are affordability checks that are required before actioning
            for (let i = 0; i < count; i++) {
                if (retVal) {
                    tempRetVal = this.vue.action();
                    retVal = tempRetVal === undefined ? retVal : retVal && tempRetVal;

                    if (this === state.evolutions.Rna) { retVal = retVal && resources.RNA.currentQuantity < resources.RNA.maxQuantity; }
                    else if (this === state.evolutions.Dna) { retVal = retVal && resources.DNA.currentQuantity < resources.DNA.maxQuantity; }
                    else if (this === state.cityBuildings.Food) { retVal = retVal && resources.Food.currentQuantity < resources.Food.maxQuantity; }
                    else if (this === state.cityBuildings.Lumber) { retVal = retVal && resources.Lumber.currentQuantity < resources.Lumber.maxQuantity; }
                    else if (this === state.cityBuildings.Stone) { retVal = retVal && resources.Stone.currentQuantity < resources.Stone.maxQuantity; }
                    else if (this === state.cityBuildings.Slaughter) {
                        retVal = retVal && (resources.Lumber.currentQuantity < resources.Lumber.maxQuantity || resources.Food.currentQuantity < resources.Food.maxQuantity);
                    }
                }
            }

            if (game.global.race.species === speciesProtoplasm // Don't log evolution actions
                    || this === state.cityBuildings.Food // Don't log gathering actions
                    || this === state.cityBuildings.Lumber
                    || this === state.cityBuildings.Stone
                    || this === state.cityBuildings.Slaughter
                    || this === state.cityBuildings.SlaveMarket) { // Don't log buying slaves
                return retVal;
            }

            if (this.gameMax > 1 && this.gameMax < Number.MAX_SAFE_INTEGER) {
                // This build has segments that will be built
                state.log.logSuccess(loggingTypes.multi_construction, `${this.title} (${this.count}) has been constructed.`);
            } else {
                state.log.logSuccess(loggingTypes.construction, `${this.title} has been constructed.`);
            }

            return retVal;
        }

        /**
         * @param {number} count
         */
        clickIfCountLessThan(count) {
            if (this.count < count && this.count < this.autoMax) {
                return this.click(1);
            }

            return false;
        }

        /**
         * @param {Resource} resource
         * @param {number} rate
         */
        addResourceConsumption(resource, rate) {
            this.consumption.resourceTypes.push({ resource: resource, initialRate: rate, rate: rate });
        }

        missingSupply() {
            for (let j = 0; j < this.consumption.resourceTypes.length; j++) {
                let resourceType = this.consumption.resourceTypes[j];

                // Food fluctuate a lot, ignore it, assuming we always can get more
                if (resourceType.resource === resources.Food && settings.autoJobs && state.jobs.Farmer.isManaged()) {
                    continue;
                }

                // Adjust fuel
                if (this._tab === "space" && (resourceType.resource === resources.Oil || resourceType.resource === resources.Helium_3)) {
                    resourceType.rate = spaceFuelAdjust(resourceType.initialRate);
                }
                if (this._tab === "interstellar" && (resourceType.resource === resources.Deuterium || resourceType.resource === resources.Helium_3) && this !== state.spaceBuildings.AlphaFusion) {
                    resourceType.rate = intFuelAdjust(resourceType.initialRate);
                }

                let rateOfChange = resourceType.resource.calculatedRateOfChange;
                // Adjust decay
                if (game.global.race[challengeDecay]) {
                    rateOfChange += resourceType.resource.decayRate;
                }

                // It need something that we're lacking
                if (resourceType.rate > 0 && rateOfChange < resourceType.rate) {
                    return resourceType;
                }

                // It provides support which we don't need
                if (resourceType.rate < 0 && resourceType.resource.isSupport() && rateOfChange > 0) {
                    return resourceType;
                }

                // BeltSpaceStation is special case, as it provide jobs, which provides support, thus we can have 0 support even with powered buildings, if jobs not filled
                if (this === state.spaceBuildings.BeltSpaceStation && resourceType.resource === resources.Belt_Support && state.jobs.SpaceMiner.count < state.jobs.SpaceMiner.max){
                    return {resource: resources.Population, rate: 1};
                }
            }
            return false; // false means we have all we need for this to operate
        }
        //#endregion Standard actions

        //#region Buildings

        hasCount() {
            if (!this.isUnlocked()) {
                return false;
            }

            return this.instance !== undefined && this.instance.hasOwnProperty("count");
        }

        get count() {
            if (!this.hasCount()) {
                return 0;
            }

            return this.instance.count;
        }

        hasState() {
            if (!this.isUnlocked()) {
                return false;
            }

            // If there is an "on" state count node then there is state
            return document.querySelector(this._hashOnElement) !== null;
        }

        get stateOnCount() {
            if (!this.hasState()) {
                return 0;
            }

            return this.instance.on;
        }

        get stateOffCount() {
            if (!this.hasState()) {
                return 0;
            }

            return this.instance.count - this.instance.on;
        }

        isStateOnWarning() {
            if (!this.hasState()) {
                return false;
            }

            if (this.stateOnCount === 0) {
                return false;
            }

            return document.querySelector(this._hashWarnElement) !== null;
        }

        /**
         * @param {number} adjustCount
         */
        tryAdjustState(adjustCount) {
            if (adjustCount === 0 || !this.hasState()) {
                return false;
            }

            if (adjustCount > 0) {
                state.multiplier.reset(adjustCount);
                while (state.multiplier.remainder > 0) {
                    state.multiplier.setMultiplier();
                    this.vue.power_on();
                }

                return;
            }

            if (adjustCount < 0) {
                adjustCount = adjustCount * -1; // We always want a positive number as we're calling an opposite function

                state.multiplier.reset(adjustCount);
                while (state.multiplier.remainder > 0) {
                    state.multiplier.setMultiplier();
                    this.vue.power_off();
                }

                return;
            }
        }

        //#endregion Buildings
    }

    const Fibonacci = [
        5,
        8,
        13,
        21,
        34,
        55,
        89,
        144,
        233,
        377,
        610,
        987,
        1597,
        2584,
        4181,
        6765,
        10946,
        17711,
        28657,
        46368,
        75025,
        121393,
        196418,
        317811,
        514229,
    ];

    class MinorTrait {
        /**
         * @param {string} traitName
         */
        constructor(traitName) {
            this.traitName = traitName;

            this.priority = 0;
            this.autoMinorTraitEnabled = true;
            this.autoMinorTraitWeighting = 0;
        }

        isUnlocked() {
            return game.global.race.hasOwnProperty(this.traitName);
        }

        get geneCount() {
            if (game.global.race['minor'] && game.global.race.minor[this.traitName]) {
                return game.global.race.minor[this.traitName];
            }

            return 0;
        }

        get phageCount() {
            if (game.global.genes['minor'] && game.global.genes.minor[this.traitName]) {
                return game.global.genes.minor[this.traitName];
            }

            return 0;
        }

        get totalCount() {
            if (game.global.race[this.traitName]) {
                return game.global.race[this.traitName];
            }

            return 0;
        }

        get geneCost() {
            let count = this.geneCount;

            if (count < 0 || count >= Fibonacci.length) {
                return Number.MAX_SAFE_INTEGER;
            }

            return this.traitName === 'mastery' ? Fibonacci[count] * 5 : Fibonacci[count];
        }
    }

    class MinorTraitManager {
        constructor() {
            /** @type {MinorTrait[]} */
            this.priorityList = [];

            this._lastLoopCounter = 0;
            /** @type {MinorTrait[]} */
            this._managedPriorityList = [];

            this._traitVueBinding = "geneticBreakdown";
        }

        isUnlocked() {
            return game.global.tech['genetics'] > 2;
        }

        clearPriorityList() {
            this.priorityList.length = 0;
            this._managedPriorityList.length = 0;
        }

        /**
         * @param {MinorTrait} minorTrait
         */
        addMinorTraitToPriorityList(minorTrait) {
            minorTrait.priority = this.priorityList.length;
            this.priorityList.push(minorTrait);
        }

        sortByPriority() {
            this.priorityList.sort(function (a, b) { return a.priority - b.priority } );
            this._managedPriorityList.sort(function (a, b) { return a.priority - b.priority } );
        }

        managedPriorityList() {
            if (this._lastLoopCounter != state.loopCounter) {
                this._managedPriorityList.length = 0; // clear array
            }

            if (!this.isUnlocked()) return this._managedPriorityList;

            if (this._managedPriorityList.length === 0) {
                this._lastLoopCounter = state.loopCounter;

                for (let i = 0; i < this.priorityList.length; i++) {
                    const minorTrait = this.priorityList[i];

                    if (minorTrait.autoMinorTraitEnabled && minorTrait.isUnlocked()) {
                        this._managedPriorityList.push(minorTrait);
                    }
                }
            }

            return this._managedPriorityList;
        }

        /**
         * @param {string} traitName
         * @param {number} count
         */
        tryBuyWithGenes(traitName, count) {
            if (count === 0) { return true; }
            if (!this.isUnlocked()) { return false; }
            let vue = getVueById(this._traitVueBinding);
            if (vue === undefined) { return false; }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                vue.gene(traitName);
            }

            return true;
        }
    }

    class ResourceProductionCost {
        /**
         * @param {Resource} resource
         * @param {number} quantity
         * @param {number} minRateOfChange
         */
        constructor(resource, quantity, minRateOfChange) {
            this.resource = resource;
            this.quantity = quantity;
            this.minRateOfChange = minRateOfChange;
        }
    }

    class ResourceRequirement {
        /**
         * @param {Resource} resource
         * @param {number} quantity
         */
        constructor(resource, quantity) {
            this.resource = resource;
            this.quantity = quantity;
        }
    }

    class Resource {
        /**
         * @param {string} name
         * @param {string} id
         */
        constructor(name, id) {
            this.name = name;
            this._id = id;
            this.autoCraftEnabled = true;

            this.currentTradeRouteBuyPrice = 0;
            this.currentTradeRouteSellPrice = 0;
            this.currentTradeRoutes = 0;

            this.marketPriority = 0;
            this.autoBuyEnabled = false;
            this.autoSellEnabled = false;
            this.autoBuyRatio = -1;
            this.autoSellRatio = -1;
            this.autoTradeBuyEnabled = false;
            this.autoTradeBuyRoutes = 0;
            this.autoTradeSellEnabled = true;
            this.autoTradeSellMinPerSecond = 0;

            this.storeOverflow = false;
            this.storagePriority = 0;
            this.storageRequired = 0;
            this.autoStorageEnabled = true;
            this._autoCratesMax = -1;
            this._autoContainersMax = -1;

            this.weighting = 1;

            this.calculatedRateOfChange = 0;

            /** @type {ResourceRequirement[]} */
            this.resourceRequirements = [];

            this._instance = null;

            this.setupCache();
        }

        setupCache() {
            this._vueBinding = "res" + this.id;
            this._stackVueBinding = "stack-" + this.id;
            this._ejectorVueBinding = "eject" + this.id;
            this.marketVueBinding = "market-" + this.id; // Used by market manager
        }

        //#region Standard resource

        get instance() {
            if (this._instance === null) {
                this._instance = game.global.resource[this.id];
            }

            return this._instance;
        }

        get id() {
            return this._id;
        }

        isUnlocked() {
            return this.instance.display;
        }

        isManagedStorage() {
            return this.hasStorage() && this.autoStorageEnabled;
        }

        isEjectable() {
            return game.atomic_mass.hasOwnProperty(this.id);
        }

        /** @return {number} */
        get atomicMass() {
            return game.atomic_mass[this.id] || 0;
        }

        /**
         * @param {number} count
         */
        increaseEjection(count) {
            let vue = getVueById(this._ejectorVueBinding);
            if (vue === undefined) { return false; }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                vue.ejectMore(this.id);
            }
        }

        /**
         * @param {number} count
         */
        decreaseEjection(count) {
            let vue = getVueById(this._ejectorVueBinding);
            if (vue === undefined) { return false; }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                vue.ejectLess(this.id);
            }
        }

        /**
         * @param {boolean} buy
         * @param {number} buyRatio
         * @param {boolean} sell
         * @param {number} sellRatio
         * @param {boolean} tradeBuy
         * @param {number} tradeBuyRoutes
         * @param {boolean} tradeSell
         * @param {number} tradeSellMinPerSecond
         */
        updateMarketState(buy, buyRatio, sell, sellRatio, tradeBuy, tradeBuyRoutes, tradeSell, tradeSellMinPerSecond) {
            this.autoBuyEnabled = buy;
            this.autoBuyRatio = buyRatio;
            this.autoSellEnabled = sell;
            this.autoSellRatio = sellRatio;
            this.autoTradeBuyEnabled = tradeBuy;
            this.autoTradeBuyRoutes = tradeBuyRoutes;
            this.autoTradeSellEnabled = tradeSell;
            this.autoTradeSellMinPerSecond = tradeSellMinPerSecond;
        }

        /**
         * @param {boolean} enabled
         * @param {number} weighting
         * @param {number} maxCrates
         * @param {number} maxContainers
         */
        updateStorageState(enabled, maxCrates, maxContainers) {
            this.autoStorageEnabled = enabled;
            this.storeOverflow = false;
            this._autoCratesMax = maxCrates;
            this._autoContainersMax = maxContainers;
        }

        isSupport() {
            return false;
        }

        isTradable() {
            return this.instance ? this.instance.hasOwnProperty("trade") : false;
        }

        isCraftable() {
            return game.craftCost().hasOwnProperty(this.id);
        }

        hasStorage() {
            return this.instance ? this.instance.stackable : false;
        }

        get currentQuantity() {
            return this.instance.amount;
        }

        get maxQuantity() {
            return this.instance.max >= 0 ? this.instance.max : Number.MAX_SAFE_INTEGER;
        }

        get tradeRouteQuantity() {
            return game.tradeRatio[this.id] || -1;
        }

        get storageRatio() {
            // If "326 / 1204" then storage ratio would be 0.27 (ie. storage is 27% full)
            if (this.maxQuantity === 0) {
                return 0;
            }

            return this.currentQuantity / this.maxQuantity;
        }

        get rateOfChange() {
            return this.instance ? this.instance.diff : 0;
        }

        get timeToFull() {
            if (this.storageRatio > 0.98) {
                return 0; // Already full.
            }
            if (this.calculatedRateOfChange <= 0) {
                return Number.MAX_SAFE_INTEGER; // Won't ever fill with current rate.
            }
            return (this.maxQuantity - this.currentQuantity) / this.calculatedRateOfChange;
        }

        get decayRate() {
            if (this.tradeRouteQuantity <= 0 || this.currentQuantity < 50) {
                return 0;
            }
            return (this.currentQuantity - 50) * (0.001 * this.tradeRouteQuantity);
        }

        //#endregion Standard resource

        //#region Basic resource

        get autoCratesMax() {
            return this._autoCratesMax < 0 ? 1000000 : this._autoCratesMax;
        }

        /**
         * @param {number} value
         */
        set autoCratesMax(value) {
            this._autoCratesMax = value;
        }

        get autoContainersMax() {
            return this._autoContainersMax < 0 ? 1000000 : this._autoContainersMax;
        }

        /**
         * @param {number} count
         */
        set autoContainersMax(count) {
            this._autoContainersMax = count;
        }

        get currentCrates() {
            return this.instance ? this.instance.crates : 0;
        }

        get currentContainers() {
            return this.instance ? this.instance.containers : 0;
        }

        /**
         * @param {number} count
         */
        tryAssignCrate(count) {
            let vue = getVueById(this._stackVueBinding);
            if (vue === undefined) { return false; }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                vue.addCrate(this.id);
            }

            return true;
        }

        /**
         * @param {number} count
         */
        tryUnassignCrate(count) {
            let vue = getVueById(this._stackVueBinding);
            if (vue === undefined) { return false; }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                vue.subCrate(this.id);
            }

            return true;
        }

        /**
         * @param {number} count
         */
        tryAssignContainer(count) {
            let vue = getVueById(this._stackVueBinding);
            if (vue === undefined) { return false; }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                vue.addCon(this.id);
            }

            return true;
        }

        /**
         * @param {number} count
         */
        tryUnassignContainer(count) {
            let vue = getVueById(this._stackVueBinding);
            if (vue === undefined) { return false; }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                vue.subCon(this.id);
            }

            return true;
        }

        //#endregion Basic resource

        //#region Craftable resource

        /**
         * @param {number} count
         */
        tryCraftX(count) {
            if (!this.isUnlocked()) { return false; }
            if (game.global.race[challengeNoCraft]) { return false; }

            let vue = getVueById(this._vueBinding);
            if (vue === undefined) { return false; }

            vue.craft(this.id, count);

            return true;
        }

        //#endregion Craftable resource
    }

    class Power extends Resource {
        // This isn't really a resource but we're going to make a dummy one so that we can treat it like a resource
        constructor() {
            super("Power", "powerMeter");
        }

        //#region Standard resource

        isUnlocked() {
            return game.global.city.powered;
        }

        get currentQuantity() {
            return game.global.city.power; // game.global.city.power_total is the total of all power currently being generated
        }

        get maxQuantity() {
            return Number.MAX_SAFE_INTEGER;
        }

        get rateOfChange() {
            // This isn't really a resource so we'll be super tricky here and set the rate of change to be the available quantity
            return this.currentQuantity;
        }

        //#endregion Standard resource
    }

    class Support extends Resource {
        // This isn't really a resource but we're going to make a dummy one so that we can treat it like a resource

        /**
         * @param {string} name
         * @param {string} id
         * @param {string} region
         * @param {string} inRegionId
         */
        constructor(name, id, region, inRegionId) {
            super(name, id);

            this._region = region;
            this._inRegionId = inRegionId;
        }

        //#region Standard resource

        isUnlocked() {
            let containerNode = document.getElementById(this.id);
            return containerNode !== null && containerNode.style.display !== "none";
        }

        isSupport() {
            return true;
        }

        get currentQuantity() {
            if (!this.isUnlocked()) {
                return 0;
            }

            let supportId = game.actions[this._region][this._inRegionId].info.support;
            if (supportId) {
                let currentQuantity = game.global[this._region][supportId].support;
                if (currentQuantity) {
                    return currentQuantity;
                }
            }

            return 0;
        }

        get maxQuantity() {
            if (!this.isUnlocked()) {
                return 0;
            }

            let supportId = game.actions[this._region][this._inRegionId].info.support;
            if (supportId) {
                let maxQuantity = game.global[this._region][supportId].s_max;
                if (maxQuantity) {
                    return maxQuantity;
                }
            }

            return 0;
        }

        get rateOfChange() {
            // This isn't really a resource so we'll be super tricky here and set the rate of change to be the available quantity
            return this.maxQuantity - this.currentQuantity;
        }

        //#endregion Standard resource
    }

    class SpecialResource extends Resource {
        constructor(name, id) {
            super(name, id);
        }

        isUnlocked() {
            return this.currentQuantity > 0;
        }

        get currentQuantity() {
            return this.id === "AntiPlasmid" ? game.global.race[this.id].anti : game.global.race[this.id].count;
        }

        get maxQuantity() {
            return Number.MAX_SAFE_INTEGER;
        }
    }

    class Population extends Resource {
        constructor() {
            super("Population", "Population");
        }

        get id() {
            // The population node is special and its id will change to the race name
            return getRaceId();
        }
    }

    const SmelterFuelTypes = {
        Wood: 0,
        Coal: 1,
        Oil: 2,
    }

    const SmelterSmeltingTypes = {
        Iron: 0,
        Steel: 1,
    }

    class SmelterFuel {
        /**
         * @param {Resource} resource
         */
        constructor(resource) {
            this.id = resource.id;
            this.resource = resource;
            this.enabled = true;
            this.priority = 0;

            this.fuelIndex = 0;
            this.productionCost = null;
            this.required = 0;
            this.adjustment = 0;
        }
    }

    class Smelter extends Action {
        constructor() {
            super("Smelter", "city", "smelter", "");

            this._vue = null;

            /** @type {ResourceProductionCost[][]} */
            this.smeltingConsumption = [ [], [] ];

            /** @type {SmelterFuel[]} */
            this._fuelPriorityList = [];
        }

        clearFuelPriorityList() {
            this._fuelPriorityList.length = 0;
        }

        /**
         * @param {SmelterFuel} fuel
         */
        addFuelToPriorityList(fuel) {
            fuel.priority = this._fuelPriorityList.length;
            this._fuelPriorityList.push(fuel);

            if (fuel.resource === resources.Lumber) {
                fuel.fuelIndex = SmelterFuelTypes.Wood;
                fuel.productionCost = new ResourceProductionCost(resources.Lumber, 0, 6);
            }

            if (fuel.resource === resources.Coal) {
                fuel.fuelIndex = SmelterFuelTypes.Coal;
                fuel.productionCost = new ResourceProductionCost(resources.Coal, 0, 2);
            }

            if (fuel.resource === resources.Oil) {
                fuel.fuelIndex = SmelterFuelTypes.Oil;
                fuel.productionCost = new ResourceProductionCost(resources.Oil, 0.35, 2);
            }
        }

        sortByPriority() {
            this._fuelPriorityList.sort(function (a, b) { return a.priority - b.priority } );
        }

        managedFuelPriorityList() {
            this._fuelPriorityList.forEach(fuel => {
                fuel.required = 0;
                fuel.adjustment = 0;

                if (fuel.resource === resources.Lumber) {
                    fuel.productionCost.quantity = (game.global.race[racialTraitEvil] && !game.global.race[racialTraitSoulEater] ? 1 : 3);
                }

                if (fuel.resource === resources.Coal) {
                    fuel.productionCost.quantity = game.global.race[racialTraitKindlingKindred] ? 0.15 : 0.25;
                }
            });

            return this._fuelPriorityList;
        }

        /**
         * @param {number} smeltingType
         * @param {Resource} resource
         * @param {number} quantity
         * @param {number} minRateOfChange
         */
        addSmeltingConsumption(smeltingType, resource, quantity, minRateOfChange) {
            this.smeltingConsumption[smeltingType].push(new ResourceProductionCost(resource, quantity, minRateOfChange));
        }

        hasOptions() {
            // Always has options once unlocked
            return this.isUnlocked() && this.count > 0;
        }

        isOptionsCached() {
            return this._vue !== null;
        }

        cacheOptions() {
            let vue = getVueById("iSmelter");
            if (vue !== undefined) {
                this._vue = vue;
                return;
            }

            if (!this.hasOptions() || state.windowManager.isOpen()) {
                return;
            }

            let optionsNode = document.querySelector("#city-smelter .special");
            let title = typeof game.actions.city.smelter.title === 'string' ? game.actions.city.smelter.title : game.actions.city.smelter.title();
            state.windowManager.openModalWindowWithCallback(title, this.cacheOptionsCallback, optionsNode);
        }

        cacheOptionsCallback() {
            state.cityBuildings.Smelter._vue = getVueById("specialModal");
        }

        /**
         * @param {number} fuelType
         */
        isFuelUnlocked(fuelType) {
            if (!this.isOptionsCached()) {
                return false;
            }

            if (fuelType === SmelterFuelTypes.Wood) {
                return !game.global.race[racialTraitKindlingKindred];
            }

            if (fuelType === SmelterFuelTypes.Coal) {
                return game.global.resource.Coal.display;
            }

            if (fuelType === SmelterFuelTypes.Oil) {
                return game.global.resource.Oil.display;
            }
        }

        /**
         * @param {number} fuelType
         */
        fueledCount(fuelType) {
            if (!this.isFuelUnlocked(fuelType)) {
                return 0;
            }

            if (fuelType === SmelterFuelTypes.Wood) {
                return game.global.city.smelter.Wood;
            }

            if (fuelType === SmelterFuelTypes.Coal) {
                return game.global.city.smelter.Coal;
            }

            if (fuelType === SmelterFuelTypes.Oil) {
                return game.global.city.smelter.Oil;
            }
        }

        /**
         * @param {number} smeltingType
         */
        isSmeltingUnlocked(smeltingType) {
            if (!this.isOptionsCached()) {
                return false;
            }

            // Iron is always unlocked if the smelter is available
            if (smeltingType === SmelterSmeltingTypes.Iron) {
                return this.isUnlocked();
            }

            if (smeltingType === SmelterSmeltingTypes.Steel) {
                return game.global.resource.Steel.display && game.global.tech.smelting >= 2
            }

            return false;
        }

        /**
         * @param {number} smeltingType
         */
        smeltingCount(smeltingType) {
            if (!this.isSmeltingUnlocked(smeltingType)) {
                return 0;
            }

            if (smeltingType === SmelterSmeltingTypes.Iron) {
                return game.global.city.smelter.Iron;
            }

            if (smeltingType === SmelterSmeltingTypes.Steel) {
                return game.global.city.smelter.Steel;
            }
        }

        /**
         * @param {number} fuelType
         * @param {number} count
         */
        increaseFuel(fuelType, count) {
            if (count === 0 || !this.isFuelUnlocked(fuelType)) {
                return false;
            }

            if (count < 0) {
                return this.decreaseFuel(fuelType, count * -1);
            }

            let type = null;

            if (fuelType === SmelterFuelTypes.Wood) {
                type = "Wood";
            }

            if (fuelType === SmelterFuelTypes.Coal) {
                type = "Coal";
            }

            if (fuelType === SmelterFuelTypes.Oil) {
                type = "Oil";
            }

            if (type === null) { return false; }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._vue.addFuel(type);
            }

            return true;
        }

        /**
         * @param {number} fuelType
         * @param {number} count
         */
        decreaseFuel(fuelType, count) {
            if (count === 0 || !this.isFuelUnlocked(fuelType)) {
                return false;
            }

            if (count < 0) {
                return this.increaseFuel(fuelType, count * -1);
            }

            let type = null;

            if (fuelType === SmelterFuelTypes.Wood) {
                type = "Wood";
            }

            if (fuelType === SmelterFuelTypes.Coal) {
                type = "Coal";
            }

            if (fuelType === SmelterFuelTypes.Oil) {
                type = "Oil";
            }

            if (type === null) { return false; }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._vue.subFuel(type);
            }

            return true;
        }

        /**
         * @param {number} smeltingType
         * @param {number} count
         */
        increaseSmelting(smeltingType, count) {
            // Increasing one decreases the other so no need for both an "increaseXXXX" and a "descreaseXXXX"
            if (count === 0 || !this.isSmeltingUnlocked(smeltingType)) {
                return false;
            }

            let func = null;

            if (smeltingType === SmelterSmeltingTypes.Iron) {
                func = this._vue.ironSmelting;
            }

            if (smeltingType === SmelterSmeltingTypes.Steel) {
                func = this._vue.steelSmelting;
            }

            if (func === null) { return false; }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                func();
            }

            return true;
        }

        get maxOperating() {
            let operating = this.count;

            if (game.global.tech['star_forge'] && game.global.tech['star_forge'] >= 2) {
                operating += (state.spaceBuildings.NeutronStellarForge.stateOnCount * 2);
            }

            return operating;
        }
    }

    const FactoryGoods = {
        LuxuryGoods: "Lux",
        Furs: "Furs",
        Alloy: "Alloy",
        Polymer: "Polymer",
        NanoTube: "Nano",
        Stanene: "Stanene",
    }

    class Factory extends Action {
        constructor() {
            super("Factory", "city", "factory", "");

            this._vue = null;

            this._productionCosts = null;
            this._productionOptions = null;
        }

        hasOptions() {
            // Always has options once unlocked
            return this.isUnlocked() && this.count > 0;
        }

        isOptionsCached() {
            return this._vue !== null;
        }

        cacheOptions() {
            let vue = getVueById("iFactory");
            if (vue !== undefined) {
                this._vue = vue;
                return;
            }

            if (!this.hasOptions() || state.windowManager.isOpen()) {
                return;
            }

            let optionsNode = document.querySelector("#city-factory .special");
            let title = typeof game.actions.city.factory.title === 'string' ? game.actions.city.factory.title : game.actions.city.factory.title();
            state.windowManager.openModalWindowWithCallback(title, this.cacheOptionsCallback, optionsNode);
        }

        cacheOptionsCallback() {
            state.cityBuildings.Factory._vue = getVueById("specialModal");
        }

        get maxOperating() {
            if (!this.isOptionsCached()) {
                return 0;
            }

            let operating = game.global.space['red_factory'] ? game.global.space.red_factory.on + game.global.city.factory.on : game.global.city.factory.on;
            operating += (state.spaceBuildings.AlphaMegaFactory.stateOnCount * 2);

            return operating;
        }

        get productionOptions() {
            if (this._productionOptions === null) {
                this._productionOptions = [];
                this._productionOptions.push({ seq: 1, goods: FactoryGoods.LuxuryGoods, resource: resources.Money, enabled: false, weighting: 1, requiredFactories: 0, factoryAdjustment: 0, completed: false });
                this._productionOptions.push({ seq: 2, goods: FactoryGoods.Furs, resource: resources.Furs, enabled: false, weighting: 0, requiredFactories: 0, factoryAdjustment: 0, completed: false });
                this._productionOptions.push({ seq: 3, goods: FactoryGoods.Alloy, resource: resources.Alloy, enabled: true, weighting: 2, requiredFactories: 0, completed: false });
                this._productionOptions.push({ seq: 4, goods: FactoryGoods.Polymer, resource: resources.Polymer, enabled: false, weighting: 2, requiredFactories: 0, completed: false });
                this._productionOptions.push({ seq: 5, goods: FactoryGoods.NanoTube, resource: resources.Nano_Tube, enabled: true, weighting: 8, requiredFactories: 0, completed: false });
                this._productionOptions.push({ seq: 6, goods: FactoryGoods.Stanene, resource: resources.Stanene, enabled: true, weighting: 8, requiredFactories: 0, completed: false });
            }

            this._productionOptions.forEach(production => {
                production.requiredFactories = 0;
                production.factoryAdjustment = 0;
                production.completed = !production.enabled || !state.cityBuildings.Factory.isProductionUnlocked(production.goods);
            });

            this._productionOptions.sort(function (a, b) { return b.weighting - a.weighting } );
            return this._productionOptions;
        }

        /**
         * @param {string} production
         */
        isProductionUnlocked(production) {
            if (!this.isOptionsCached()) {
                return false;
            }

            if (production === FactoryGoods.LuxuryGoods || production === FactoryGoods.Alloy) {
                return true;
            }

            if (production === FactoryGoods.Furs) {
                return game.global.tech['synthetic_fur'];
            }

            if (production === FactoryGoods.Polymer) {
                return game.global.tech['polymer'];
            }

            if (production === FactoryGoods.NanoTube) {
                return game.global.tech['nano'];
            }

            if (production === FactoryGoods.Stanene) {
                return game.global.tech['stanene'];
            }

            return false;
        }

        /**
         * @param {string} production
         */
        productionCosts(production) {
            if (this._productionCosts === null) {
                this._productionCosts = {};
                this._productionCosts[FactoryGoods.LuxuryGoods] = [];
                this._productionCosts[FactoryGoods.LuxuryGoods].push(new ResourceProductionCost(resources.Furs, 1, 5));

                this._productionCosts[FactoryGoods.Furs] = [];
                this._productionCosts[FactoryGoods.Furs].push(new ResourceProductionCost(resources.Money, 1, 1000));
                this._productionCosts[FactoryGoods.Furs].push(new ResourceProductionCost(resources.Polymer, 1, 10));

                this._productionCosts[FactoryGoods.Alloy] = [];
                this._productionCosts[FactoryGoods.Alloy].push(new ResourceProductionCost(resources.Copper, 1, 5));
                this._productionCosts[FactoryGoods.Alloy].push(new ResourceProductionCost(resources.Aluminium, 1, 5));

                this._productionCosts[FactoryGoods.Polymer] = [];
                this._productionCosts[FactoryGoods.Polymer].push(new ResourceProductionCost(resources.Oil, 1, 2));
                this._productionCosts[FactoryGoods.Polymer].push(new ResourceProductionCost(resources.Lumber, 1, 50));

                this._productionCosts[FactoryGoods.NanoTube] = [];
                this._productionCosts[FactoryGoods.NanoTube].push(new ResourceProductionCost(resources.Coal, 1, 15));
                this._productionCosts[FactoryGoods.NanoTube].push(new ResourceProductionCost(resources.Neutronium, 1, 0.2));

                this._productionCosts[FactoryGoods.Stanene] = [];
                this._productionCosts[FactoryGoods.Stanene].push(new ResourceProductionCost(resources.Aluminium, 1, 50));
                this._productionCosts[FactoryGoods.Stanene].push(new ResourceProductionCost(resources.Nano_Tube, 1, 5));
            }

            let assembly = game.global.tech[techFactory] ? true : false;

            if (production === FactoryGoods.LuxuryGoods) {
                this._productionCosts[production][0].quantity = (assembly ? game.f_rate.Lux.fur[game.global.tech[techFactory]] : game.f_rate.Lux.fur[0]);
            }

            if (production === FactoryGoods.Furs) {
                this._productionCosts[production][0].quantity = (assembly ? game.f_rate.Furs.money[game.global.tech[techFactory]] : game.f_rate.Furs.money[0]);
                this._productionCosts[production][1].quantity = (assembly ? game.f_rate.Furs.polymer[game.global.tech[techFactory]] : game.f_rate.Furs.polymer[0]);
            }

            if (production === FactoryGoods.Alloy) {
                this._productionCosts[production][0].quantity = (assembly ? game.f_rate.Alloy.copper[game.global.tech[techFactory]] : game.f_rate.Alloy.copper[0]);
                this._productionCosts[production][1].quantity = (assembly ? game.f_rate.Alloy.aluminium[game.global.tech[techFactory]] : game.f_rate.Alloy.aluminium[0]);
            }

            if (production === FactoryGoods.Polymer) {
                this._productionCosts[production][0].quantity = game.global.race[racialTraitKindlingKindred] ? (assembly ? game.f_rate.Polymer.oil_kk[game.global.tech[techFactory]] : game.f_rate.Polymer.oil_kk[0]) : (assembly ? game.f_rate.Polymer.oil[game.global.tech[techFactory]] : game.f_rate.Polymer.oil[0]);
                this._productionCosts[production][1].quantity = game.global.race[racialTraitKindlingKindred] ? 0 : (assembly ? game.f_rate.Polymer.lumber[game.global.tech[techFactory]] : game.f_rate.Polymer.lumber[0]);
            }

            if (production === FactoryGoods.NanoTube) {
                this._productionCosts[production][0].quantity = (assembly ? game.f_rate.Nano_Tube.coal[game.global.tech[techFactory]] : game.f_rate.Nano_Tube.coal[0]);
                this._productionCosts[production][1].quantity = (assembly ? game.f_rate.Nano_Tube.neutronium[game.global.tech[techFactory]] : game.f_rate.Nano_Tube.neutronium[0]);
            }

            if (production === FactoryGoods.Stanene) {
                this._productionCosts[production][0].quantity = (assembly ? game.f_rate.Stanene.aluminium[game.global.tech[techFactory]] : game.f_rate.Stanene.aluminium[0]);
                this._productionCosts[production][1].quantity = (assembly ? game.f_rate.Stanene.nano[game.global.tech[techFactory]] : game.f_rate.Stanene.nano[0]);
            }

            return this._productionCosts[production];
        }

        /**
         * @param {string} production
         */
        currentProduction(production) {
            if (!this.isProductionUnlocked(production)) {
                return 0;
            }

            return game.global.city.factory[production];
        }

        /**
         * @param {string} production
         * @param {number} count
         */
        increaseProduction(production, count) {
            if (count === 0 || !this.isProductionUnlocked(production)) {
                return false;
            }

            if (count < 0) {
                return this.decreaseProduction(production, count * -1);
            }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._vue.addItem(production);
            }

            return true;
        }

        /**
         * @param {string} production
         * @param {number} count
         */
        decreaseProduction(production, count) {
            if (count === 0 || !this.isProductionUnlocked(production)) {
                return false;
            }

            if (count < 0) {
                return this.increaseProduction(production, count * -1);
            }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._vue.subItem(production);
            }

            return true;
        }
    }

    const MiningDroidGoods = {
        Adamantite: "adam",
        Uranium: "uran",
        Coal: "coal",
        Aluminium: "alum",
    }

    class MiningDroid extends Action {
        constructor() {
            super("Alpha Mining Droid", "interstellar", "mining_droid", "int_alpha");

            this._vue = null;
        }

        hasOptions() {
            // Always has options once unlocked
            return this.isUnlocked() && this.count > 0;
        }

        isOptionsCached() {
            return this._vue !== null;
        }

        cacheOptions() {
            let vue = getVueById("iDroid");
            if (vue !== undefined) {
                this._vue = vue;
                return;
            }

            if (!this.hasOptions() || state.windowManager.isOpen()) {
                return;
            }

            let optionsNode = document.querySelector("#interstellar-mining_droid .special");
            let title = typeof game.actions.interstellar.int_alpha.mining_droid.title === 'string' ? game.actions.interstellar.int_alpha.mining_droid.title : game.actions.interstellar.int_alpha.mining_droid.title();
            state.windowManager.openModalWindowWithCallback(title, this.cacheOptionsCallback, optionsNode);
        }

        cacheOptionsCallback() {
            state.spaceBuildings.AlphaMiningDroid._vue = getVueById("specialModal");
        }

        get currentOperating() {
            if (!this.isOptionsCached()) {
                return 0;
            }

            return game.global.interstellar.mining_droid.adam + game.global.interstellar.mining_droid.uran + game.global.interstellar.mining_droid.coal + game.global.interstellar.mining_droid.alum;
        }

        get maxOperating() {
            if (!this.isOptionsCached()) {
                return 0;
            }

            return game.global.interstellar.mining_droid.on;
        }

        /**
         * @param {string} production
         */
        isProductionUnlocked(production) {
            // All production is immediately unlocked
            return this.isOptionsCached();
        }

        /**
         * @param {string} production
         */
        currentProduction(production) {
            if (!this.isProductionUnlocked(production)) {
                return 0;
            }

            return game.global.interstellar.mining_droid[production];
        }

        /**
         * @param {string} production
         * @param {number} count
         */
        increaseProduction(production, count) {
            if (count === 0 || !this.isProductionUnlocked(production)) {
                return false;
            }

            if (count < 0) {
                return this.decreaseProduction(production, count * -1);
            }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._vue.addItem(production);
            }

            return true;
        }

        /**
         * @param {string} production
         * @param {number} count
         */
        decreaseProduction(production, count) {
            if (count === 0 || !this.isProductionUnlocked(production)) {
                return false;
            }

            if (count < 0) {
                return this.increaseProduction(production, count * -1);
            }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._vue.subItem(production);
            }

            return true;
        }
    }

    const GrapheneFuelTypes = {
        Lumber: 0,
        Coal: 1,
        Oil: 2,
    }

    class GraphenePlant extends Action {
        constructor() {
            super("Alpha Factory", "interstellar", "g_factory", "int_alpha");

            this._vue = null;

            /** @type {ResourceProductionCost[]} */
            this.grapheheConsumption = [];
        }

        /**
         * @param {Resource} resource
         * @param {number} quantity
         * @param {number} minRateOfChange
         */
        addGrapheneConsumption(resource, quantity, minRateOfChange) {
            this.grapheheConsumption.push(new ResourceProductionCost(resource, quantity, minRateOfChange));
        }

        hasOptions() {
            // Always has options once unlocked
            return this.isUnlocked() && this.count > 0;
        }

        isOptionsCached() {
            return this._vue !== null;
        }

        cacheOptions() {
            let vue = getVueById("iGraphene");
            if (vue !== undefined) {
                this._vue = vue;
                return;
            }

            if (!this.hasOptions() || state.windowManager.isOpen()) {
                return;
            }

            let optionsNode = document.querySelector("#interstellar-g_factory .special");
            let title = typeof game.actions.interstellar.int_alpha.g_factory.title === 'string' ? game.actions.interstellar.int_alpha.g_factory.title : game.actions.interstellar.int_alpha.g_factory.title();
            state.windowManager.openModalWindowWithCallback(title, this.cacheOptionsCallback, optionsNode);
        }

        cacheOptionsCallback() {
            state.spaceBuildings.AlphaFactory._vue = getVueById("specialModal");
        }

        /**
         * @param {number} fuelType
         */
        isFuelUnlocked(fuelType) {
            if (!this.isOptionsCached()) {
                return false;
            }

            if (fuelType === GrapheneFuelTypes.Lumber) {
                return !game.global.race[racialTraitKindlingKindred];
            }

            if (fuelType === GrapheneFuelTypes.Coal) {
                return game.global.resource.Coal.display;
            }

            if (fuelType === GrapheneFuelTypes.Oil) {
                return game.global.resource.Oil.display;
            }
        }

        /**
         * @param {number} fuelType
         */
        fueledCount(fuelType) {
            if (!this.isFuelUnlocked(fuelType)) {
                return 0;
            }

            if (fuelType === GrapheneFuelTypes.Lumber) {
                return game.global.interstellar.g_factory.Lumber;
            }

            if (fuelType === GrapheneFuelTypes.Coal) {
                return game.global.interstellar.g_factory.Coal;
            }

            if (fuelType === GrapheneFuelTypes.Oil) {
                return game.global.interstellar.g_factory.Oil;
            }
        }

        /**
         * @param {number} fuelType
         * @param {number} count
         */
        increaseFuel(fuelType, count) {
            if (count === 0 || !this.isFuelUnlocked(fuelType)) {
                return false;
            }

            if (count < 0) {
                return this.decreaseFuel(fuelType, count * -1);
            }

            let func = null;

            if (fuelType === GrapheneFuelTypes.Lumber) {
                func = this._vue.addWood;
            }

            if (fuelType === GrapheneFuelTypes.Coal) {
                func = this._vue.addCoal;
            }

            if (fuelType === GrapheneFuelTypes.Oil) {
                func = this._vue.addOil;
            }

            if (func === null) { return false; }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                func();
            }

            return true;
        }

        /**
         * @param {number} fuelType
         * @param {number} count
         */
        decreaseFuel(fuelType, count) {
            if (count === 0 || !this.isFuelUnlocked(fuelType)) {
                return false;
            }

            if (count < 0) {
                return this.increaseFuel(fuelType, count * -1);
            }

            let func = null;

            if (fuelType === GrapheneFuelTypes.Wood) {
                func = this._vue.subWood;
            }

            if (fuelType === GrapheneFuelTypes.Coal) {
                func = this._vue.subCoal;
            }

            if (fuelType === GrapheneFuelTypes.Oil) {
                func = this._vue.subOil;
            }

            if (func === null) { return false; }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                func();
            }

            return true;
        }
    }

    class SpaceDock extends Action {
        constructor() {
            super("Gas Space Dock", "space", "star_dock", "spc_gas");
        }

        hasOptions() {
            // Always has options once unlocked
            return this.isUnlocked() && this.count > 0;
        }

        isOptionsCached() {
            if (!this.hasOptions() || game.global.tech['genesis'] < 4) {
                // It doesn't have options yet so I guess all "none" of them are cached!
                // Also return true if we don't have the required tech level yet
                return true;
            }

            // If our tech is unlocked but we haven't cached the vue the the options aren't cached
            if (!state.spaceBuildings.GasSpaceDockProbe.isOptionsCached()
                || game.global.tech['genesis'] >= 5 && !state.spaceBuildings.GasSpaceDockShipSegment.isOptionsCached()
                || game.global.tech['genesis'] === 6 && !state.spaceBuildings.GasSpaceDockPrepForLaunch.isOptionsCached()
                || game.global.tech['genesis'] >= 7 && !state.spaceBuildings.GasSpaceDockLaunch.isOptionsCached()) {
                return false;
            }

            return true;
        }

        cacheOptions() {
            if (!this.hasOptions() || state.windowManager.isOpen()) {
                return false;
            }

            let optionsNode = document.querySelector("#space-star_dock .special");
            let title = typeof game.actions.space.spc_gas.star_dock.title === 'string' ? game.actions.space.spc_gas.star_dock.title : game.actions.space.spc_gas.star_dock.title();
            state.windowManager.openModalWindowWithCallback(title, this.cacheOptionsCallback, optionsNode);
            return true;
        }

        cacheOptionsCallback() {
            state.spaceBuildings.GasSpaceDockProbe.cacheOptions();
            state.spaceBuildings.GasSpaceDockShipSegment.cacheOptions();
            state.spaceBuildings.GasSpaceDockPrepForLaunch.cacheOptions();
            state.spaceBuildings.GasSpaceDockLaunch.cacheOptions();
        }
    }

    class ModalAction extends Action {
        /**
         * @param {string} name
         * @param {string} tab
         * @param {string} id
         * @param {string} location
         * @param {string} modalTab
         */
        constructor(name, tab, id, location, modalTab) {
            super(name, tab, id, location);

            this._modalTab = modalTab;
            this._vue = undefined;
        }

        get vue() {
            return this._vue;
        }

        get definition() {
            if (this._definition !== null) {
                return this._definition;
            }

            if (location !== null && location !== undefined && this._location != "") {
                this._definition = game.actions[this._modalTab][this._location][this._id];
            } else {
                this._definition = game.actions[this._modalTab][this._id];
            }

            return this._definition;
        }

        get instance() {
            if (this._instance !== null) {
                return this._instance;
            }

            let id = this.specialId === null ? this._id : this.specialId;
            this._instance = game.global[this._modalTab][id];

            return this._instance;
        }

        isOptionsCached() {
            return this.vue !== undefined;
        }

        cacheOptions() {
            this._vue = getVueById(this._vueBinding);
        }

        isUnlocked() {
            // We have to override this as there won't be an element unless the modal window is open
            return this._vue !== undefined;
        }
    }

    var governmentTypes =
    {
        anarchy: { id: "anarchy", name: function () { return game.loc("govern_anarchy") } }, // Special - should not be shown to player
        autocracy: { id: "autocracy", name: function () { return game.loc("govern_autocracy") } },
        democracy: { id: "democracy", name: function () { return game.loc("govern_democracy") } },
        oligarchy: { id: "oligarchy", name: function () { return game.loc("govern_oligarchy") } },
        theocracy: { id: "theocracy", name: function () { return game.loc("govern_theocracy") } },
        republic: { id: "republic", name: function () { return game.loc("govern_republic") } },
        socialist: { id: "socialist", name: function () { return game.loc("govern_socialist") } },
        corpocracy: { id: "corpocracy", name: function () { return game.loc("govern_corpocracy") } },
        technocracy: { id: "technocracy", name: function () { return game.loc("govern_technocracy") } },
        federation: { id: "federation", name: function () { return game.loc("govern_federation") } },
    };

    class GovernmentManager {
        constructor() {
            this._governmentToSet = null;
        }

        isUnlocked() {
            let node = document.getElementById("govType");
            return node !== null && node.style.display !== "none";
        }

        isEnabled() {
            let node = document.querySelector("#govType button");
            return this.isUnlocked() && node !== null && node.getAttribute("disabled") !== "disabled";
        }

        get currentGovernment() {
            return game.global.civic.govern.type;
        }

        /**
         * @param {string} government
         */
        isGovernmentUnlocked(government) {
            if (government === governmentTypes.theocracy.id && !game.global.tech['gov_theo']) {
                return false;
            }

            if (government === governmentTypes.republic.id && game.global.tech['govern'] < 2) {
                return false;
            }

            if (government === governmentTypes.socialist.id && !game.global.tech['gov_soc']) {
                return false;
            }

            if (government === governmentTypes.corpocracy.id && !game.global.tech['gov_corp']) {
                return false;
            }

            if (government === governmentTypes.technocracy.id && game.global.tech['govern'] < 3) {
                return false;
            }

            if (government === governmentTypes.federation.id && !game.global.tech['gov_fed']) {
                return false;
            }

            // all other governments are immediately unlocked
            return true;
        }

        /**
         * @param {string} government
         */
        setGovernment(government) {
            if (!this.isEnabled()) { return; }
            if (!this.isGovernmentUnlocked(government)) { return; }
            if (government === governmentTypes.anarchy.id) { return; }
            if (state.windowManager.isOpen()) { return; } // Don't try anything if a window is already open

            let optionsNode = document.querySelector("#govType button");
            let title = game.loc('civics_government_type');
            this._governmentToSet = government;
            state.windowManager.openModalWindowWithCallback(title, this.setGovernmentCallback, optionsNode);
        }

        setGovernmentCallback() {
            if (state.governmentManager._governmentToSet !== null) {
                // The government modal window does some tricky stuff when selecting a government.
                // It removes and destroys popups so we have to have a popup there for it to destroy!
                let button = document.querySelector(`#govModal [data-gov="${state.governmentManager._governmentToSet}"]`);
                let evObj = document.createEvent("Events");
                evObj.initEvent("mouseover", true, false);
                button.dispatchEvent(evObj);
                state.log.logSuccess(loggingTypes.special, `Revolution! Government changed to ${governmentTypes[state.governmentManager._governmentToSet].name()}.`)
                logClick(button, "set government");
                state.governmentManager._governmentToSet = null;
            }
        }
    }

    var espionageTypes =
    {
        Influence: { id: "influence" },
        Sabotage: { id: "sabotage" },
        Incite: { id: "incite" },
        Annex: { id: "annex" },
        Purchase: { id: "purchase" },
        Occupy: { id: "occupy" },
    };

    class SpyManager {
        constructor() {
            this._espionageToPerform = null;

            /** @type {number[]} */
            this._lastAttackLoop = [ -1000, -1000, -1000 ]; // Last loop counter than we attacked. Don't want to run influence when we are attacking foreign powers
        }

        isUnlocked() {
            if (!game.global.tech['spy']) { return false; }

            let node = document.getElementById("foreign");
            if (node === null || node.style.display === "none") { return false; }

            let foreignVue = getVueById("foreign");
            if (foreignVue === undefined || !foreignVue.vis()) { return false; }

            return true;
        }

        /**
         * @param {number} govIndex
         */
        updateLastAttackLoop(govIndex) {
            this._lastAttackLoop[govIndex] = state.loopCounter;
        }

        /**
         * @param {any} govIndex
         * @param {string} espionageId
         */
        performEspionage(govIndex, espionageId) {
            if (!this.isUnlocked()) { return; }
            if (state.windowManager.isOpen()) { return; } // Don't try anything if a window is already open

            let optionsSpan = document.querySelector(`#gov${govIndex} div span:nth-child(3)`);
            // @ts-ignore
            if (optionsSpan.style.display === "none") { return; }

            let optionsNode = document.querySelector(`#gov${govIndex} div span:nth-child(3) button`);
            if (optionsNode === null || optionsNode.getAttribute("disabled") === "disabled") { return; }

            if (espionageId === espionageTypes.Occupy.id) {
                if (this.isEspionageUseful(govIndex, espionageTypes.Sabotage.id)) {
                    this._espionageToPerform = espionageTypes.Sabotage.id;
                }
            } else if (espionageId === espionageTypes.Annex.id || espionageId === espionageTypes.Purchase.id) {
                // Occupation routine
                if (this.isEspionageUseful(govIndex, espionageId)) {
                    // If we can annex\purchase right now - do it
                    this._espionageToPerform = espionageId;
                } else if (this.isEspionageUseful(govIndex, espionageTypes.Influence.id) &&
                           state.loopCounter - this._lastAttackLoop[govIndex] >= 600) {
                    // Influence goes second, as it always have clear indication when HSTL already at zero
                    this._espionageToPerform = espionageTypes.Influence.id;
                } else if (this.isEspionageUseful(govIndex, espionageTypes.Incite.id)) {
                    // And now incite
                    this._espionageToPerform = espionageTypes.Incite.id;
                }
            } else if (this.isEspionageUseful(govIndex, espionageId)) {
                // User specified spy operation. If it is not already at miximum effect then proceed with it.
                this._espionageToPerform = espionageId;
            }

            if (this._espionageToPerform !== null) {
                state.log.logSuccess(loggingTypes.spying, `Performing "${this._espionageToPerform}" covert operation against ${getGovName(govIndex)}.`)
                let title = game.loc('civics_espionage_actions');
                state.windowManager.openModalWindowWithCallback(title, this.performEspionageCallback, optionsNode);
            }
        }

        /**
         * @param {string} govIndex
         * @param {string} espionageId
         */
        isEspionageUseful(govIndex, espionageId) {
            let govProp = "gov" + govIndex;

            if (espionageId === espionageTypes.Occupy.id) {
                return this.isEspionageUseful(govIndex, espionageTypes.Sabotage.id);
            }

            if (espionageId === espionageTypes.Influence.id) {
                // MINIMUM hstl (relation) is 0 so if we are already at 0 then don't perform this operation
                if (game.global.civic.foreign[govProp].spy < 1 && game.global.civic.foreign[govProp].hstl > 10) {
                    // With less than one spy we can only see general relations. If relations are worse than Good then operation is useful
                    // Good relations is <= 10 hstl
                    return true;
                } else if (game.global.civic.foreign[govProp].hstl > 0) {
                    // We have enough spies to know the exact value. 0 is minimum so only useful if > 0
                    return true;
                }
            }

            if (espionageId === espionageTypes.Sabotage.id) {
                // MINIMUM mil (military) is 50 so if we are already at 50 then don't perform this operation
                if (game.global.civic.foreign[govProp].spy < 1) {
                    // With less than one spy we don't have any indication of military strength so return that operation is useful
                    return true;
                } else if (game.global.civic.foreign[govProp].spy === 1 && game.global.civic.foreign[govProp].mil >= 75) {
                    // With one spy we can only see general military strength. If military strength is better than Weak then operation is useful
                    // Weak military is < 75 mil
                    return true;
                } else if (game.global.civic.foreign[govProp].mil > 50) {
                    // We have enough spies to know the exact value. 50 is minimum so only useful if > 50
                    return true;
                }
            }

            if (espionageId === espionageTypes.Incite.id) {
                // MAXIMUM unrest (discontent) is 100 so if we are already at 100 then don't perform this operation
                // Discontent requires at least 4 spies to see the value
                if (game.global.civic.foreign[govProp].spy < 3) {
                    // With less than three spies we don't have any indication of discontent so return that operation is useful
                    return true;
                } else if (game.global.civic.foreign[govProp].spy === 3 && game.global.civic.foreign[govProp].unrest <= 75) {
                    // With three spies we can only see general discontent. If discontent is lower than High then operation is useful
                    // High discontent is <= 75 mil
                    return true;
                } else if (game.global.civic.foreign[govProp].unrest < 100) {
                    // We have enough spies to know the exact value. 100 is maximum so only useful if < 100
                    return true;
                }
            }

            if (espionageId === espionageTypes.Annex.id) {
                // Annex option shows up once hstl <= 50 && unrest >= 50
                // And we're also checking morale, to make sure button not just showed, but can actually be clicked
                if (game.global.civic.foreign[govProp].hstl <= 50 && game.global.civic.foreign[govProp].unrest >= 50 && game.global.city.morale.current >= (200 + game.global.civic.foreign[govProp].hstl - game.global.civic.foreign[govProp].unrest)){
                    return true;
                }
            }

            if (espionageId === espionageTypes.Purchase.id) {
                // Check if we have enough spies and money
                if (game.global.civic.foreign[govProp].spy >= 3 && resources.Money.currentQuantity >= govPrice(govProp)){
                    return true;
                }
            }

            return false;
        }

        performEspionageCallback() {
            if (state.spyManager._espionageToPerform !== null) {
                // The espionage modal window does some tricky stuff when selecting a mission.
                // It removes and destroys popups so we have to have a popup there for it to destroy!
                let button = document.querySelector(`#espModal [data-esp="${state.spyManager._espionageToPerform}"]`);
                let evObj = document.createEvent("Events");
                evObj.initEvent("mouseover", true, false);
                button.dispatchEvent(evObj);
                logClick(button, "perform espionage");
                state.spyManager._espionageToPerform = null;
            }
        }
    }

    class EvolutionAction extends Action {
        /**
         * @param {string} name
         * @param {string} tab
         * @param {string} id
         * @param {string} location
         */
        constructor(name, tab, id, location) {
            super(name, tab, id, location);
        }

        get definition() {
            if (this._definition !== null) {
                return this._definition;
            }

            if (location !== null && location !== undefined && this._location != "") {
                this._definition = game.actions.evolution[this._location][this._id];
            } else {
                this._definition = game.actions.evolution[this._id];
            }

            return this._definition;
        }

        get instance() {
            if (this._instance !== null) {
                return this._instance;
            }

            let id = this.specialId === null ? this._id : this.specialId;
            this._instance = game.global.evolution[id];

            return this._instance;
        }
    }

    class ChallengeEvolutionAction extends EvolutionAction {
        /**
         * @param {string} name
         * @param {string} tab
         * @param {string} id
         * @param {string} location
         * @param {string} effectId
         */
        constructor(name, tab, id, location, effectId) {
            super(name, tab, id, location);

            this.effectId = effectId;
        }
    }

    class ModalWindowManager {
        constructor() {
            this.openedByScript = false;
            this._callbackWindowTitle = "";
            this._callbackFunction = null;

            this._closingWindowName = "";
            this._intervalID = 0;
        }

        get currentModalWindowTitle() {
            let modalTitleNode = document.getElementById("modalBoxTitle");
            if (modalTitleNode === null) {
                return "";
            }

            // Modal title will either be a single name or a combination of resource and storage
            // eg. single name "Smelter" or "Factory"
            // eg. combination "Iridium - 26.4K/279.9K"
            let indexOfDash = modalTitleNode.textContent.indexOf(" - ");
            if (indexOfDash === -1) {
                return modalTitleNode.textContent;
            } else {
                return modalTitleNode.textContent.substring(0, indexOfDash);
            }
        }

        /**
         * @param {string} callbackWindowTitle
         * @param {Function} callbackFunction
         * @param {Element} elementToClick
         */
        openModalWindowWithCallback(callbackWindowTitle, callbackFunction, elementToClick) {
            if (this.isOpen()) {
                return;
            }

            this.openedByScript = true;
            this._callbackWindowTitle = callbackWindowTitle;
            this._callbackFunction = callbackFunction;
            if (this._intervalID === 0) {
              this._intervalID = setInterval(this.checkCallbacks.bind(this), 50);
            }
            logClick(elementToClick, "open modal " + callbackWindowTitle);
        }

        isOpenHtml() {
            return document.getElementById("modalBox") !== null;
        }

        isOpen() {
            // Checks both the game modal window and our script modal window
            // game = modalBox
            // script = scriptModal
            return this.openedByScript || document.getElementById("modalBox") !== null || document.getElementById("scriptModal").style.display === "block";
        }

        closeModalWindow() {
            let modalCloseBtn = document.querySelector('.modal .modal-close');
            if (modalCloseBtn !== null) {
                logClick(modalCloseBtn, "closing modal");
                this._closingWindowName = "";
                this.openedByScript = false;
                if (this._intervalID !== 0) {
                  clearInterval(this._intervalID);
                  this._intervalID = 0;
                }
            }
        }

        resetWindowManager() {
            this.openedByScript = false;
            this._callbackWindowTitle = "";
            this._callbackFunction = null;
            if (this._intervalID !== 0) {
              clearInterval(this._intervalID);
              this._intervalID = 0;
            }
        }

        checkCallbacks() {
            //console.log("_callbackWindowTitle: " + this._callbackWindowTitle + ", _closingWindowName: " + this._closingWindowName);
            if (this._closingWindowName !== "") {
                if (document.querySelector('.modal')) {
                    this.closeModalWindow();
                } else {
                    this._closingWindowName = "";
                    this.openedByScript = false;
                    if (this._intervalID !== 0) {
                      clearInterval(this._intervalID);
                      this._intervalID = 0;
                    }
                }
            }

            // We only care if the script itself opened the modal. If the user did it then ignore it.
            // There must be a call back function otherwise there is nothing to do.
            if (!this.openedByScript || this._callbackFunction === null) {
                return;
            }

            let windowName = this.currentModalWindowTitle;
            //console.log("windowname " + windowName);

            // It is open but doesn't have a title?
            if (windowName === "") {
                return;
            }

            //console.log("checking for specific callbacks - " + this._callbackFunction + " " + this._callbackWindowTitle + "/" + windowName);

            if (windowName === this._callbackWindowTitle) {
                this._callbackFunction();

                this._callbackWindowTitle = "";
                this._callbackFunction = null;

                this._closingWindowName = windowName;
                this.closeModalWindow();
            }
        }
    }

    class Campaign {
        /**
         * @param {string} name
         * @param {string} id
         * @param {number} rating
         * @param {number} maxRating
         */
        constructor(name, id, rating, maxRating) {
            this.name = name;
            this.id = id;
            this.rating = rating;
            this.maxRating = maxRating;
        }

        /**
         * @param {number} govIndex
         */
        getRatingForGov(govIndex) {
            if (govIndex < 0) { return this.rating; }
            return this.rating * this.getMultiplierForGov(govIndex);
        }

        /**
         * @param {number} govIndex
         */
        getMaxRatingForGov(govIndex) {
            if (govIndex < 0) { return this.maxRating; }
            return this.maxRating * this.getMultiplierForGov(govIndex);
        }

        getMultiplierForGov(govIndex) {
            let govProp = "gov" + govIndex;
            if (game.global.civic.foreign[govProp].spy >= 2) {
                // We know the exact number
                return game.global.civic.foreign[govProp].mil / 100;
            } else if (game.global.civic.foreign[govProp].spy === 1) {
                // We know the general range - be conservative and go for the top of the range
                if (game.global.civic.foreign[govProp].mil < 50){
                    return 0.5;
                }
                else if (game.global.civic.foreign[govProp].mil < 75){
                    return 0.75;
                }
                else if (game.global.civic.foreign[govProp].mil > 200){
                    return 2.2;
                }
                else if (game.global.civic.foreign[govProp].mil > 160){
                    return 2;
                }
                else if (game.global.civic.foreign[govProp].mil > 125){
                    return 1.6;
                }
                else {
                    return 1.25;
                }
            } else {
                // We know nothing - return the worst case scenario
                return 2;
            }
        }
    }

    class WarManager {
        constructor() {
            /** @type {Campaign[]} */
            this.campaignList = [];
            this._vueBinding = "garrison";
            this._hellVueBinding = "gFort";

            this._textArmy = "army";

            this.selectedGovAttackIndex = -1;
            this.hellAttractorMax = 0;
        }

        clearCampaignList() {
            this.campaignList = [];
        }

        /**
         * @param {string} name
         * @param {number} rating
         * @param {number} maxRating
         */
        addToCampaignList(name, rating, maxRating) {
            this.campaignList.push(new Campaign(name, name, rating, maxRating));
        }

        /**
         * @param {string} campaignId
         * @param {number} campaignMinimumRating
         */
        updateCampaign(campaignId, campaignMinimumRating) {
            let campaign = this.campaignList.find(campaign => campaign.id === campaignId);
            if (campaign) {
                campaign.rating = campaignMinimumRating;
            }
        }

        isUnlocked() {
            let node = document.getElementById("foreign");
            return node !== null && node.style.display !== "none";
        }

        /**
         * @param {number} govIndex
         */
        launchCampaign(govIndex) {
            if (!this.isUnlocked()) {
                return false;
            }

            // launch against first external city for now
            state.spyManager.updateLastAttackLoop(govIndex);
            getVueById(this._vueBinding).campaign(govIndex);
            return true;
        }

        isMercenaryUnlocked() {
            //return game.global.civic.garrison.mercs;
            return document.querySelector("#garrison .first") !== null;
        }

        getMercenaryCost() {
            let cost = Math.round((1.24 ** game.global.civic.garrison.workers) * 75) - 50;
            if (cost > 25000){
                cost = 25000;
            }
            if (game.global.civic.garrison.m_use > 0){
                cost *= 1.1 ** game.global.civic.garrison.m_use;
            }
            if (game.global.race['brute']){
                cost = cost / 2;
            }

            return cost;
        }

        hireMercenary() {
            if (!this.isMercenaryUnlocked()) {
                return false;
            }

            getVueById(this._vueBinding).hire();
            return true;
        }

        get currentOffensiveRating() {
            if (!this.isUnlocked()) {
                return 0;
            }

            return parseFloat(document.querySelector("#garrison .header > span:nth-child(2) > span:nth-child(1)").textContent);
        }

        get maxOffensiveRating() {
            if (!this.isUnlocked()) {
                return 0;
            }

            return parseFloat(document.querySelector("#garrison .header > span:nth-child(2) > span:nth-child(2)").textContent);
        }

        get currentSoldiers() {
            return game.global.civic.garrison.workers - game.global.civic.garrison.crew;
        }

        get maxSoldiers() {
            return game.global.civic.garrison.max - game.global.civic.garrison.crew;
        }

        get woundedSoldiers() {
            return game.global.civic.garrison.wounded;
        }

        get availableSoldiers() {
            return game.global.civic.garrison.workers - game.global.civic.garrison.crew;
        }

        get hellSoldiers() {
            if (game.global.portal.fortress) {
                return game.global.portal.fortress.garrison;
            } else {
                return 0;
            }
        }

        get hellPatrols() {
            if (game.global.portal.fortress) {
                return game.global.portal.fortress.patrols;
            } else {
                return 0;
            }
        }

        get hellPatrolSize() {
            if (game.global.portal.fortress) {
                return game.global.portal.fortress.patrol_size;
            } else {
                return 0;
            }
        }

        get hellSoulForgeSoldiers(){
            if (!game.global.portal.soul_forge || !game.global.portal.soul_forge.on) return 0;

            // Taken from the game code, so should give the same result
            let soldiers = Math.round(650 / game.armyRating(1,this._textArmy));
            if (game.global.portal.gun_emplacement) {
                soldiers -= game.global.portal.gun_emplacement.on * (game.global.tech.hell_gun >= 2 ? 2 : 1);
                if (soldiers < 0){
                    soldiers = 0;
                }
            }
            return soldiers;
        }

        get hellGarrison()  {
            if (game.global.portal.fortress) {
                return game.global.portal.fortress.garrison - game.global.portal.fortress.patrol_size * game.global.portal.fortress.patrols - this.hellSoulForgeSoldiers;
            } else {
                return 0;
            }
        }

        get currentCityGarrison() {
            return this.availableSoldiers - this.hellSoldiers;
        }

        get maxCityGarrison() {
            return this.maxSoldiers - this.hellSoldiers;
        }

        increaseCampaignDifficulty() {
            if (!this.isUnlocked()) {
                return false;
            }

            getVueById(this._vueBinding).next();
            return true;
        }

        decreaseCampaignDifficulty() {
            if (!this.isUnlocked()) {
                return false;
            }

            getVueById(this._vueBinding).last();
            return true;
        }

        get currentBattalion() {
            if (!this.isUnlocked()) {
                return 0;
            }

            return game.global.civic.garrison.raid;
        }

        /**
         * @param {number} count
         */
        addBattalion(count) {
            if (!this.isUnlocked()) {
                return false;
            }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                getVueById(this._vueBinding).aNext();
            }

            return true;
        }

        /**
         * @param {number} count
         */
        removeBattalion(count) {
            if (!this.isUnlocked()) {
                return false;
            }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                getVueById(this._vueBinding).aLast();
            }

            return true;
        }

        /**
         * @param {number} targetRating
         * Calculates the required soldiers to reach the given attack rating, assuming everyone is healthy.
         */
        getSoldiersForAttackRating(targetRating) {
            if (!targetRating || targetRating <= 0) {
                return 0;
            }
            let singleSoldierAttackRating = 0;

            if (!game.global.race[racialTraitHiveMind]) {
                // No hivemind so take the army rating to 1 decimal place by getting the rating for 10 soldiers and dividing it by number of soldiers
                // eg. single soldier = 3.8657. armyRating(1) = floor(3.8657) = 3. armyRating(100) / 100 = 386 / 100 = 3.86
                let soldiers = 10;
                singleSoldierAttackRating = game.armyRating(soldiers, this._textArmy, 0) / soldiers;

                return Math.ceil(targetRating / singleSoldierAttackRating);
            }

            // Ok, we've done no hivemind. Hivemind is trickier because each soldier gives attack rating and a bonus to all other soldiers.
            // I'm sure there is an exact mathematical calculation for this but...
            // Just loop through and remove 1 at a time until we're under the max rating.
            let soldiers = 10;
            singleSoldierAttackRating = game.armyRating(soldiers, this._textArmy, 0) / soldiers;
            let maxSoldiers = Math.ceil(targetRating / singleSoldierAttackRating);
            // At 10 soldiers there's no hivemind bonus or malus, and the malus gets up to 50%, so start with up to 2x soldiers below 10
            if (maxSoldiers < 10) maxSoldiers = Math.min(10, 2 * maxSoldiers);
            let testMaxSoldiers = maxSoldiers - 1;

            while (testMaxSoldiers > 0 && game.armyRating(testMaxSoldiers, this._textArmy, 0) > targetRating) {
                maxSoldiers = testMaxSoldiers;
                testMaxSoldiers -= 1;
            }

            return maxSoldiers;
        }

        /**
         * @param {number} govIndex
         */
        getMaxSoldiersForAttackType(govIndex) {
            let campaign = this.campaignList[game.global.civic.garrison.tactic];
            return this.getSoldiersForAttackRating(campaign.getMaxRatingForGov(govIndex));
        }

        /**
         * @param {number} govOccupyIndex
         * @param {number} govAttackIndex
         * @return {boolean}
         */
        switchToBestAttackType(govOccupyIndex, govAttackIndex) {
            let attackRating = game.armyRating(this.currentSoldiers, this._textArmy)
            this.selectedGovAttackIndex = -1;

            if (this.campaignList.length === 0 || game.global.civic.garrison.tactic === -1) {
                return false;
            }

            let maxCampaignIndex = this.campaignList.length - 1;

            if (govOccupyIndex >= 0) {
                let siegeCampaign = this.campaignList[this.campaignList.length - 1];
                if (attackRating > siegeCampaign.getRatingForGov(govOccupyIndex)) {
                    //console.log("setting gov index to govOccupyIndex")
                    this.selectedGovAttackIndex = govOccupyIndex;
                }
            }

            if (this.selectedGovAttackIndex === -1) {
                // We can't siege our preferred target so keep looking
                if (govAttackIndex >= 0) {
                    maxCampaignIndex = this.campaignList.length - 2; // Limit attack to assault so that we don't occupy with a siege
                    this.selectedGovAttackIndex = govAttackIndex;
                    //console.log("setting gov index to govAttackIndex")
                }
            }

            // There isn't anyone suitable to attack
            if (this.selectedGovAttackIndex === -1) { return false; }

            let requiredTactic = game.global.civic.garrison.tactic;

            for (let i = maxCampaignIndex; i >= 0; i--) {
                let campaign = this.campaignList[i];
                let campaignAttackRating = campaign.getRatingForGov(this.selectedGovAttackIndex);
                let campaignMaxAttackRating = campaign.getMaxRatingForGov(this.selectedGovAttackIndex);

                // We are within our ranges so this is the required tactic
                if (attackRating >= campaignAttackRating && attackRating < campaignMaxAttackRating) {
                    requiredTactic = i;
                    break;
                }

                // We have more than the maximum required for this attack. Since we are looping through backwards from highest to lowest
                // we know that we have already ruled out any higher tier campaigns so set this as the required tactic
                if (attackRating > campaignMaxAttackRating) {
                    requiredTactic = i;
                    break;
                }

                // There are no lower campaigns. So this is it. The absolute minimum. Good job.
                if (i === 0) {
                    requiredTactic = i;
                    break;
                }
            }

            while (requiredTactic > game.global.civic.garrison.tactic) {
                this.increaseCampaignDifficulty();
            }

            while (requiredTactic < game.global.civic.garrison.tactic) {
                this.decreaseCampaignDifficulty();
            }

            return true;
        }

        // Autohell functions start here
        isHellUnlocked() {
            let node = document.getElementById("gFort");
            return node !== null && node.style.display !== "none";
        }

        /**
         * @param {number} count
         */
        addHellGarrison(count) {
            if (!this.isHellUnlocked()) {
                return false;
            }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                getVueById(this._hellVueBinding).aNext();
            }

            return true;
        }

        /**
         * @param {number} count
         */
        removeHellGarrison(count) {
            if (!this.isHellUnlocked()) {
                return false;
            }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                getVueById(this._hellVueBinding).aLast();
            }

            return true;
        }

        /**
         * @param {number} count
         */
        addHellPatrol(count) {
            if (!this.isHellUnlocked()) {
                return false;
            }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                getVueById(this._hellVueBinding).patInc();
            }

            return true;
        }

        /**
         * @param {number} count
         */
        removeHellPatrol(count) {
            if (!this.isHellUnlocked()) {
                return false;
            }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                getVueById(this._hellVueBinding).patDec();
            }

            return true;
        }

        /**
         * @param {number} count
         */
        addHellPatrolSize(count) {
            if (!this.isHellUnlocked()) {
                return false;
            }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                getVueById(this._hellVueBinding).patSizeInc();
            }

            return true;
        }

        /**
         * @param {number} count
         */
        removeHellPatrolSize(count) {
            if (!this.isHellUnlocked()) {
                return false;
            }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                getVueById(this._hellVueBinding).patSizeDec();
            }

            return true;
        }

        updateHell() {
            if (!this.isHellUnlocked()) return;

            // Determine the number of powered attractors
            // The goal is to keep threat in the desired range
            // If threat is larger than the configured top value, turn all attractors off
            // If threat is lower than the bottom value, turn all attractors on
            // Linear in between
            this.hellAttractorMax = 0;
            if (settings.hellHandleAttractors && game.global.portal.attractor && game.global.portal.fortress.threat < settings.hellAttractorTopThreat && game.global.portal.fortress.assigned > 0) {
                this.hellAttractorMax = game.global.portal.attractor.count;
                if (game.global.portal.fortress.threat > settings.hellAttractorBottomThreat && settings.hellAttractorTopThreat > settings.hellAttractorBottomThreat) {
                    this.hellAttractorMax = Math.floor(this.hellAttractorMax * (settings.hellAttractorTopThreat - game.global.portal.fortress.threat)
                                                        / (settings.hellAttractorTopThreat - settings.hellAttractorBottomThreat));
                }
            }

            // Determine Patrol size and count
            let hellGarrison = 0;
            let targetHellSoldiers = 0;
            let targetHellPatrols = 0;
            let targetHellPatrolSize = 0;
            // First handle not having enough soldiers, then handle patrols
            // Only go into hell at all if walls are maxed and soldiers are close to full, or we are already there
            if (settings.hellHandlePatrolCount && this.maxSoldiers > settings.hellHomeGarrison + settings.hellMinSoldiers
                 && (this.hellSoldiers > settings.hellMinSoldiers
                     || (this.availableSoldiers >= this.maxSoldiers * settings.hellMinSoldiersPercent / 100))) { // `&& game.global.portal.fortress.walls === 100` - don't like it. What the point in waiting with full garrison? Send them to death! Country need moar infernite.
                targetHellSoldiers = Math.min(this.availableSoldiers, this.maxSoldiers - settings.hellHomeGarrison); // Leftovers from an incomplete patrol go to hell garrison
                let availableHellSoldiers = targetHellSoldiers - this.hellSoulForgeSoldiers;

                // Determine target hell garrison size
                // Estimated average damage is roughly 35 * threat / defense, so required defense = 35 * threat / targetDamage
                // But the threat hitting the fortress is only an intermediate result in the bloodwar calculation, it happens after predators and patrols but before repopulation,
                // So siege threat is actually lower than what we can see. Patrol and drone damage is wildly swingy and hard to estimate, so don't try to estimate the post-fight threat.
                // Instead base the defense on the displayed threat, and provide an option to bolster defenses when the walls get low. The threat used in the calculation
                // ranges from 1 * threat for 100% walls to the multiplier entered in the settings at 0% walls.
                let hellGarrison = this.getSoldiersForAttackRating(Math.max(0, // don't go below 0
                                                                   (1 + (settings.hellLowWallsMulti - 1) * (1 - game.global.portal.fortress.walls / 100)) // threat modifier from damaged walls = 1 to lowWallsMulti
                                                                   * game.global.portal.fortress.threat * 35 / settings.hellTargetFortressDamage // required defense to meet target average damage based on current threat
                                                                   - (game.global.portal.turret ? game.global.portal.turret.on : 0) // turret count
                                                                      * (game.global.tech['turret'] ? (game.global.tech['turret'] >= 2 ? 70 : 50) : 35))); // turret power

                // Always have at least half our hell contingent available for patrols, and if we cant defend properly just send everyone
                if (availableHellSoldiers < hellGarrison) {
                    hellGarrison = 0; // If we cant defend adequately, send everyone out on patrol
                } else if (availableHellSoldiers < hellGarrison * 2) {
                    hellGarrison = Math.floor(availableHellSoldiers / 2); // Always try to send out at least half our people
                }

                // Determine the patrol attack rating
                // let tempRating1 = 0;
                // let tempRating2 = 0;
                if (settings.hellHandlePatrolSize) {
                    let patrolRating = game.global.portal.fortress.threat * settings.hellPatrolThreatPercent / 100;
                    //tempRating1 = patrolRating;

                    // Now reduce rating based on drones, droids and bootcamps
                    if (game.global.portal.war_drone) {
                        patrolRating -= settings.hellPatrolDroneMod * game.global.portal.war_drone.on * (game.global.tech['portal'] >= 7 ? 1.5 : 1);
                    }
                    if (game.global.portal.war_droid) {
                        patrolRating -= settings.hellPatrolDroidMod * game.global.portal.war_droid.on * (game.global.tech['hdroid'] ? 2 : 1);
                    }
                    if (game.global.city.boot_camp) {
                        patrolRating -= settings.hellPatrolBootcampMod * game.global.city.boot_camp.count;
                    }
                    //tempRating2 = patrolRating;

                    // In the end, don't go lower than the minimum...
                    patrolRating = Math.max(patrolRating, settings.hellPatrolMinRating);

                    // Increase patrol attack rating if alive soldier count is low to reduce patrol losses
                    if (settings.hellBolsterPatrolRating > 0 && settings.hellBolsterPatrolPercentTop > 0) { // Check if settings are on
                        const homeGarrisonFillRatio = this.currentCityGarrison / this.maxCityGarrison;
                        if (homeGarrisonFillRatio <= settings.hellBolsterPatrolPercentTop / 100) { // If less than top
                            if (homeGarrisonFillRatio <= settings.hellBolsterPatrolPercentBottom / 100) { // and less than bottom
                                patrolRating += settings.hellBolsterPatrolRating; // add full rating
                            } else if (settings.hellBolsterPatrolPercentBottom < settings.hellBolsterPatrolPercentTop) { // If between bottom and top
                                patrolRating += settings.hellBolsterPatrolRating * (settings.hellBolsterPatrolPercentTop / 100 - homeGarrisonFillRatio) // add rating proportional to where in the range we are
                                                  / (settings.hellBolsterPatrolPercentTop - settings.hellBolsterPatrolPercentBottom) * 100;
                            }
                        }
                    }

                    // Patrol size
                    targetHellPatrolSize = this.getSoldiersForAttackRating(patrolRating);

                    // If patrol size is larger than available soldiers, send everyone available instead of 0
                    targetHellPatrolSize = Math.min(targetHellPatrolSize, availableHellSoldiers - hellGarrison);
                } else {
                    targetHellPatrolSize = this.hellPatrolSize;
                }

                // Determine patrol count
                targetHellPatrols = Math.floor((availableHellSoldiers - hellGarrison) / targetHellPatrolSize);

                // Special logic for small number of patrols
                if (settings.hellHandlePatrolSize && targetHellPatrols === 1) {
                    // If we could send 1.5 patrols, send 3 half-size ones instead
                    if ((availableHellSoldiers - hellGarrison) >= 1.5 * targetHellPatrolSize) {
                        targetHellPatrolSize = Math.floor((availableHellSoldiers - hellGarrison) / 3);
                        targetHellPatrols = Math.floor((availableHellSoldiers - hellGarrison) / targetHellPatrolSize);
                    }
                }

                //console.log("availableHellSoldiers: "+availableHellSoldiers+"  hellGarrison: "+hellGarrison+" patrolSize: "+targetHellPatrolSize+"  Patrols: "+targetHellPatrols+"  Patrol Rating threat/buildings/final: "
                //             +tempRating1+"/"+tempRating2+"/"+patrolRating);
            } else {
                // Try to leave hell if any soldiers are still assigned so the game doesn't put miniscule amounts of soldiers back
                if (settings.hellHandlePatrolCount && game.global.portal.fortress.assigned > 0) {
                    this.removeHellPatrolSize(1000);
                    this.removeHellPatrol(1000);
                    this.removeHellGarrison(1000);
                }
            }

            // Adjust values ingame
            // First decrease patrols, then put hell soldiers to the right amount, then increase patrols, to make sure all actions go through
            if (settings.hellHandlePatrolCount && settings.hellHandlePatrolSize && this.hellPatrolSize > targetHellPatrolSize) this.removeHellPatrolSize(this.hellPatrolSize - targetHellPatrolSize);
            if (settings.hellHandlePatrolCount && this.hellPatrols > targetHellPatrols) this.removeHellPatrol(this.hellPatrols - targetHellPatrols);
            if (settings.hellHandlePatrolCount && this.hellSoldiers > targetHellSoldiers) this.removeHellGarrison(this.hellSoldiers - targetHellSoldiers);
            if (settings.hellHandlePatrolCount && this.hellSoldiers < targetHellSoldiers) this.addHellGarrison(targetHellSoldiers - this.hellSoldiers);
            if (settings.hellHandlePatrolCount && settings.hellHandlePatrolSize && this.hellPatrolSize < targetHellPatrolSize) this.addHellPatrolSize(targetHellPatrolSize - this.hellPatrolSize);
            if (settings.hellHandlePatrolCount && this.hellPatrols < targetHellPatrols) this.addHellPatrol(targetHellPatrols - this.hellPatrols);
        }
    }

    class JobManager {
        constructor() {
            /** @type {Job[]} */
            this.priorityList = [];
            /** @type {CraftingJob[]} */
            this.craftingJobs = [];
            this.maxJobBreakpoints = -1;

            this.unemployedJob = new UnemployedJob();

            this._lastLoopCounter = 0;
            /** @type {Job[]} */
            this._managedPriorityList = [];
        }

        isUnlocked() {
            return this.unemployedJob.isUnlocked();
        }

        clearPriorityList() {
            this.priorityList.length = 0;
            this._managedPriorityList.length = 0;
        }

        /**
         * @param {Job} job
         */
        addJobToPriorityList(job) {
            job.priority = this.priorityList.length;
            this.priorityList.push(job);
            this.maxJobBreakpoints = Math.max(this.maxJobBreakpoints, job.breakpointMaxs.length);
        }

        /**
         * @param {CraftingJob} job
         */
        addCraftingJob(job) {
            this.craftingJobs.push(job);
        }

        sortByPriority() {
            this.priorityList.sort(function (a, b) { return a.priority - b.priority } );
            this._managedPriorityList.sort(function (a, b) { return a.priority - b.priority } );

            for (let i = 0; i < this.priorityList.length; i++) {
                this.maxJobBreakpoints = Math.max(this.maxJobBreakpoints, this.priorityList[i].breakpointMaxs.length);
            }

            //this.craftingJobs.sort(function (a, b) { return a.priority - b.priority } );
        }

        managedPriorityList() {
            if (this._lastLoopCounter != state.loopCounter) {
                this._managedPriorityList.length = 0; // clear array
            }

            if (this._managedPriorityList.length === 0) {
                this._lastLoopCounter = state.loopCounter;
                let evilRace = isEvilRace() && !isEvilUniverse();

                for (let i = 0; i < this.priorityList.length; i++) {
                    const job = this.priorityList[i];

                    if (job.isManaged() && (!evilRace || job !== state.jobs.Lumberjack)) {
                        // Only add craftsmen if the user has enabled the autocraftsman setting
                        if (!job.isCraftsman() || settings.autoCraftsmen) {
                            this._managedPriorityList.push(job);
                        }
                    }
                }
            }

            return this._managedPriorityList;
        }

        get unemployed() {
            if (!this.unemployedJob.isUnlocked()) {
                return 0;
            }

            if (isHunterRace()) {
                return 0;
            }

            return this.unemployedJob.count;
        }

        get employed() {
            let employed = 0;
            let jobList = this.managedPriorityList();

            for (let i = 0; i < jobList.length; i++) {
                employed += jobList[i].count;
            }

            return employed;
        }

        get totalEmployees() {
            let employees = this.unemployed + this.employed;

            return employees;
        }

        isFoundryUnlocked() {
            let containerNode = document.getElementById("foundry");
            return containerNode !== null && containerNode.style.display !== "none" && containerNode.children.length > 0 && this.maxCraftsmen > 0;
        }

        canManualCraft() {
            return !game.global.race[challengeNoCraft];
        }

        get managedCraftsmen() {
            if (!this.isFoundryUnlocked) {
                return 0;
            }

            let managedCrafters = 0;
            if (state.jobs.Plywood.isManaged()) managedCrafters++;
            if (state.jobs.Brick.isManaged()) managedCrafters++;
            if (state.jobs.WroughtIron.isManaged()) managedCrafters++;
            if (state.jobs.SheetMetal.isManaged()) managedCrafters++;
            if (state.jobs.Mythril.isManaged()) managedCrafters++;
            if (state.jobs.Aerogel.isManaged()) managedCrafters++;
            if (state.jobs.Nanoweave.isManaged()) managedCrafters++;
            if (state.jobs.Scarletite.isManaged()) managedCrafters++;
            return managedCrafters;
        }

        get currentCraftsmen() {
            return game.global.city.foundry.crafting;
        }

        get maxCraftsmen() {
            return game.global.civic.craftsman.max;
        }

        get craftingMax() {
            if (!this.isFoundryUnlocked()) {
                return 0;
            }

            let max = this.maxCraftsmen;
            for (let i = 0; i < this.craftingJobs.length; i++) {
                const job = this.craftingJobs[i];

                if (!settings['craft' + job.resource.id] || !job.isManaged()) {
                    max -= job.count;
                }
            }
            return max;
        }
    }

    class BuildingManager {
        constructor() {
            /** @type {Action[]} */
            this.priorityList = [];
            this._lastBuildLoopCounter = 0;
            this._lastStateLoopCounter = 0;
            /** @type {Action[]} */
            this._managedPriorityList = [];
            /** @type {Action[]} */
            this._statePriorityList = [];
            /** @type {Action[]} */
            this._managedStatePriorityList = [];
        }

        updateResourceRequirements() {
            this.priorityList.forEach(building => building.updateResourceRequirements());
        }

        updateWeighting() {
             // Check generic conditions, and multiplier - x1 have no effect, so skip them too.
            let activeRules = weightingRules.filter(rule => rule[0]() && rule[3]() !== 1);

            // Iterate over buildings
            for (let i = 0; i < this.priorityList.length; i++){
                const building = this.priorityList[i];
                // Reset old weighting and note
                building.extraDescription = "";
                building.weighting = building._weighting;

                // Apply weighting rules
                for (let j = 0; j < activeRules.length; j++) {
                    let result = activeRules[j][1](building);
                    // Rule passed
                    if (result) {
                      building.extraDescription += activeRules[j][2](result, building) + "<br>";
                      building.weighting *= activeRules[j][3](result);


                      // Last rule disabled building, no need to check the rest
                      if (building.weighting <= 0) {
                          break;
                      }
                    }
                }
                building.extraDescription = "AutoBuild weighting: " + building.weighting + "<br>" + building.extraDescription;
            }
        }

        clearPriorityList() {
            this.priorityList.length = 0;
            this._managedPriorityList.length = 0;
            this._statePriorityList.length = 0;
            this._managedStatePriorityList.length = 0;
        }

        /**
         * @param {Action} building
         */
        addBuildingToPriorityList(building) {
            building.priority = this.priorityList.length;
            this.priorityList.push(building);

            if (building.hasConsumption()) {
                this._statePriorityList.push(building);
            }
        }

        sortByPriority() {
            this.priorityList.sort(function (a, b) { return a.priority - b.priority } );
            this._managedPriorityList.sort(function (a, b) { return a.priority - b.priority } );
            this._statePriorityList.sort(function (a, b) { return a.priority - b.priority } );
            this._managedStatePriorityList.sort(function (a, b) { return a.priority - b.priority } );
        }

        managedPriorityList() {
            if (this._lastBuildLoopCounter != state.loopCounter) {
                this._managedPriorityList.length = 0; // clear array
            }

            if (this._managedPriorityList.length === 0) {
                this._lastBuildLoopCounter = state.loopCounter;

                for (let i = 0; i < this.priorityList.length; i++) {
                    const building = this.priorityList[i];

                    if (building.weighting > 0) {
                        this._managedPriorityList.push(building);
                    }
                }
            }

            return this._managedPriorityList;
        }

        managedStatePriorityList() {
            if (this._lastStateLoopCounter != state.loopCounter) {
                this._managedStatePriorityList.length = 0; // clear array
            }

            if (this._managedStatePriorityList.length === 0) {
                this._lastStateLoopCounter = state.loopCounter;

                for (let i = 0; i < this._statePriorityList.length; i++) {
                    const building = this._statePriorityList[i];

                    // If the building doesn't yet have state then it doesn't need to be managed (either not unlocked or tech for state not unlocked)
                    if (building.hasState() && building.autoStateEnabled || (settings.autoHell && settings.hellHandleAttractors && building === state.spaceBuildings.PortalAttractor)) {
                        this._managedStatePriorityList.push(building);
                    }
                }
            }

            return this._managedStatePriorityList;
        }
    }

    class Project {
        /**
         * @param {string} name
         * @param {string} id
         */
        constructor(name, id) {
            this.name = name;
            this.id = id;
            this.priority = 0;

            this._autoBuildEnabled = false;
            this._autoMax = -1;
            this.ignoreMinimumMoneySetting = false;

            /** @type {ResourceRequirement[]} */
            this.resourceRequirements = [];

            this._vueBinding = "arpa" + this.id;
            this._definition = null;

            this._x1ButtonSelector = `#arpa${this.id} > div.buy > button.button.x1`;
        }

        isUnlocked() {
            return document.querySelector(this._x1ButtonSelector) !== null;
        }

        get instance() {
            return game.global.arpa[this.id];
        }

        get definition() {
            if (this._definition !== null) {
                return this._definition;
            }

            this._definition = game.actions.arpa[this.id];

            return this._definition;
        }

        // This is the resource requirements for 100% of the project
        updateResourceRequirements() {
            if (!this.isUnlocked()) {
                return;
            }

            let resourceIndex = 0;
            let newCosts = game.arpaAdjustCosts(this.definition.cost);

            Object.keys(newCosts).forEach(resourceName => {
                let testCost = Number(newCosts[resourceName]()) || 0;

                if (this.resourceRequirements.length > resourceIndex) {
                    this.resourceRequirements[resourceIndex].resource = resources[resourceName];
                    this.resourceRequirements[resourceIndex].quantity = testCost;
                } else {
                    this.resourceRequirements.push(new ResourceRequirement(resources[resourceName], testCost));
                }

                resourceIndex++;
            });

            // Remove any extra elements that we have that are greater than the current number of requirements
            while (this.resourceRequirements.length > resourceIndex) {
                this.resourceRequirements.pop();
            }
        }

        get autoBuildEnabled() {
            return this._autoBuildEnabled;
        }

        /**
         * @param {boolean} value
         */
        set autoBuildEnabled(value) {
            this._autoBuildEnabled = value;
        }

        get autoMax() {
            return this._autoMax < 0 ? Number.MAX_SAFE_INTEGER : this._autoMax;
        }

        set autoMax(value) {
            if (value < 0) value = -1;
            this._autoMax = value;
        }

        get level() {
            if (this.instance === undefined || !this.instance.hasOwnProperty("rank")) {
                return 0;
            }

            return this.instance.rank;
        }

        get progress() {
            if (this.instance === undefined || !this.instance.hasOwnProperty("complete")) {
                return 0;
            }

            return this.instance.complete;
        }

        /**
         * @param {boolean} checkBuildEnabled
         */
        tryBuild(checkBuildEnabled) {
            if ((checkBuildEnabled && !this.autoBuildEnabled) || !this.isUnlocked()) {
                return false;
            }

            if (!this.ignoreMinimumMoneySetting) {
                let moneyRequirement = this.resourceRequirements.find(requirement => requirement.resource === resources.Money);
                if (moneyRequirement && moneyRequirement.quantity > 0) {
                    let moneyFloor = moneyRequirement.quantity / 100; // We are building in steps of 1%
                    if (resources.Money.currentQuantity - moneyFloor < state.minimumMoneyAllowed) {
                        return false;
                    }
                }
            }

            getVueById(this._vueBinding).build(this.id, 1);
            return true;
        }
    }

    class ProjectManager {
        constructor() {
            /** @type {Project[]} */
            this.priorityList = [];
            this._lastLoopCounter = 0;
            /** @type {Project[]} */
            this._managedPriorityList = [];
        }

        updateResourceRequirements() {
            this.priorityList.forEach(project => project.updateResourceRequirements());
        }

        clearPriorityList() {
            this.priorityList.length = 0;
            this._managedPriorityList.length = 0;
        }

        /**
         * @param {Project} project
         */
        addProjectToPriorityList(project) {
            project.priority = this.priorityList.length;
            this.priorityList.push(project);
        }

        sortByPriority() {
            this.priorityList.sort(function (a, b) { return a.priority - b.priority } );
            this._managedPriorityList.sort(function (a, b) { return a.priority - b.priority } );
        }

        managedPriorityList() {
            if (this._lastLoopCounter != state.loopCounter) {
                this._managedPriorityList.length = 0; // clear array
            }

            if (this._managedPriorityList.length === 0) {
                this._lastLoopCounter = state.loopCounter;

                for (let i = 0; i < this.priorityList.length; i++) {
                    const project = this.priorityList[i];

                    //console.log(project.id + " unlocked= " + project.isUnlocked() + " autoBuildEnabled= " + project.autoBuildEnabled + " autoSpace= " + settings.autoSpace)
                    if (project.isUnlocked() && project.autoBuildEnabled) {
                        this._managedPriorityList.push(project);
                    }
                }
            }

            return this._managedPriorityList;
        }
    }

    class MarketManager {
        constructor() {
            /** @type {Resource[]} */
            this.priorityList = [];
            this._lastLoopCounter = 0;

            /** @type {Resource[]} */
            this._sortedTradeRouteSellList = [];

            this._multiplierVueBinding = "market-qty";
        }

        isUnlocked() {
            return isResearchUnlocked("market");
        }

        clearPriorityList() {
            this.priorityList.length = 0;
            this._sortedTradeRouteSellList.length = 0;
        }

        /**
         * @param {Resource} resource
         */
        addResourceToPriorityList(resource) {
            if (resource.isTradable()) {
                resource.marketPriority = this.priorityList.length;
                this.priorityList.push(resource);
            }
        }

        sortByPriority() {
            this.priorityList.sort(function (a, b) { return a.marketPriority - b.marketPriority } );
            this._sortedTradeRouteSellList.sort(function (a, b) { return a.marketPriority - b.marketPriority } );
        }

        /** @param {Resource} resource */
        isBuySellUnlocked(resource) {
            return document.querySelector("#market-" + resource.id + " .order") !== null;
        }

        getSortedTradeRouteSellList() {
            if (this._lastLoopCounter != state.loopCounter) {
                this._sortedTradeRouteSellList.length = 0; // clear array
            }

            if (this._sortedTradeRouteSellList.length === 0) {
                this._lastLoopCounter = state.loopCounter;

                for (let i = 0; i < this.priorityList.length; i++) {
                    const resource = this.priorityList[i];

                    if (this.isResourceUnlocked(resource) && (resource.autoTradeBuyEnabled || resource.autoTradeSellEnabled)) {
                        resource.currentTradeRouteBuyPrice = this.getTradeRouteBuyPrice(resource);
                        resource.currentTradeRouteSellPrice = this.getTradeRouteSellPrice(resource);
                        resource.currentTradeRoutes = this.getTradeRoutes(resource);
                        this._sortedTradeRouteSellList.push(resource);
                    }
                }

                this._sortedTradeRouteSellList.sort(function (a, b) { return b.currentTradeRouteSellPrice - a.currentTradeRouteSellPrice } );
            }

            return this._sortedTradeRouteSellList;
        }

        /**
         * @param {number} multiplier
         */
        isMultiplierUnlocked(multiplier) {
            let element = document.querySelector("#market-qty input");
            return this.isUnlocked() && element !== null;
        }

        getMultiplier() {
            if (!this.isUnlocked()) {
                return -1;
            }

            return game.global.city.market.qty;
        }

        /**
         * @param {number} multiplier
         */
        setMultiplier(multiplier) {
            if (!this.isUnlocked()) {
                return false;
            }

            game.global.city.market.qty = multiplier;
            getVueById(this._multiplierVueBinding).val();

            return false;
        }

        getMaxMultiplier(){
            // COPIED DIRECTLY FROM GAME CODE
            if (game.global.tech['currency'] >= 6){
                return 1000000;
            }
            else if (game.global.tech['currency'] >= 4){
                return 5000;
            }
            else {
                return 100;
            }
        }

        /**
         * @param {Resource} resource
         */
        isResourceUnlocked(resource) {
            if (!this.isUnlocked()) {
                return false;
            }

            let node = document.getElementById("market-" + resource.id);
            return node !== null && node.style.display !== "none";
        }

        /**
         * @param {Resource} resource
         */
        getUnitBuyPrice(resource) {
            if (!this.isUnlocked()) {
                return -1;
            }

            let price = game.global.race['arrogant'] ? game.global.resource[resource.id].value * 1.1 : game.global.resource[resource.id].value;
            if (game.global.race['conniving']){
                price *= 0.95;
            }

            return price;
        }

        /**
         * @param {Resource} resource
         */
        getUnitSellPrice(resource) {
            if (!this.isUnlocked()) {
                return -1;
            }

            let divide = game.global.race['merchant'] ? 3 : (game.global.race['asymmetrical'] ? 5 : 4);
            if (game.global.race['conniving']){
                divide -= 0.5;
            }
            let price = game.global.resource[resource.id].value / divide;

            return price;
        }

        /**
         * @param {Resource} resource
         */
        buy(resource) {
            if (!this.isResourceUnlocked(resource)) {
                return false;
            }

            getVueById(resource.marketVueBinding).purchase(resource.id);
        }

        /**
         * @param {Resource} resource
         */
        sell(resource) {
            if (!this.isResourceUnlocked(resource)) {
                return false;
            }

            getVueById(resource.marketVueBinding).sell(resource.id);
        }

        getCurrentTradeRoutes() {
            if (!this.isUnlocked()) {
                return 0;
            }

            return game.global.city.market.trade;
        }

        getMaxTradeRoutes() {
            if (!this.isUnlocked()) {
                return 0;
            }

            return game.global.city.market.mtrade;
        }

        /**
         * @param {Resource} resource
         */
        getTradeRoutes(resource) {
            return game.global.resource[resource.id].trade;
        }

        /**
         * @param {Resource} resource
         */
        getTradeRouteQuantity(resource) {
            return game.tradeRatio[resource.id];
        }

        /**
         * @param {Resource} resource
         */
        getTradeRouteBuyPrice(resource) {
            return game.tradeBuyPrice(resource.id);
        }

        /**
         * @param {Resource} resource
         */
        getTradeRouteSellPrice(resource) {
            return game.tradeSellPrice(resource.id);
        }

        /**
         * @param {Resource} resource
         */
        zeroTradeRoutes(resource) {
            getVueById(resource.marketVueBinding).zero(resource.id);
        }

        /**
         * @param {Resource} resource
         * @param {number} count
         */
        addTradeRoutes(resource, count) {
            if (!this.isResourceUnlocked(resource)) {
                return false;
            }

            let vue = getVueById(resource.marketVueBinding);
            if (vue !== null) {
                state.multiplier.reset(count);
                while (state.multiplier.remainder > 0) {
                    state.multiplier.setMultiplier();
                    vue.autoBuy(resource.id);
                }

                return true;
            }

            return false
        }

        /**
         * @param {Resource} resource
         * @param {number} count
         */
        removeTradeRoutes(resource, count) {
            if (!this.isResourceUnlocked(resource)) {
                return false;
            }

            let vue = getVueById(resource.marketVueBinding);
            if (vue !== null) {
                state.multiplier.reset(count);
                while (state.multiplier.remainder > 0) {
                    state.multiplier.setMultiplier();
                    vue.autoSell(resource.id);
                }

                return true;
            }

            return false
        }
    }

    class StorageManager {
        constructor() {
            /** @type {Resource[]} */
            this.priorityList = [];

            this._lastLoopCounter = 0;
            /** @type {Resource[]} */
            this._managedPriorityList = [];

            this._storageVueBinding = "createHead";
        }

        isUnlocked() {
            return isResearchUnlocked("containerization");
        }

        clearPriorityList() {
            this.priorityList.length = 0;
            this._managedPriorityList.length = 0;
        }

        /**
         * @param {Resource} resource
         */
        addResourceToPriorityList(resource) {
            if (resource.hasStorage()) {
                resource.storagePriority = this.priorityList.length;
                this.priorityList.push(resource);
            }
        }

        sortByPriority() {
            this.priorityList.sort(function (a, b) { return a.storagePriority - b.storagePriority } );
            this._managedPriorityList.sort(function (a, b) { return a.storagePriority - b.storagePriority } );
        }

        managedPriorityList() {
            if (this._lastLoopCounter != state.loopCounter) {
                this._managedPriorityList.length = 0; // clear array
            }

            if (this._managedPriorityList.length === 0) {
                this._lastLoopCounter = state.loopCounter;

                for (let i = 0; i < this.priorityList.length; i++) {
                    const resource = this.priorityList[i];

                    if (resource.isUnlocked() && resource.isManagedStorage()) {
                        this._managedPriorityList.push(resource);
                    }
                }
            }

            return this._managedPriorityList;
        }

        /**
         * @param {number} count
         */
        tryConstructCrate(count) {
            if (count === 0) { return true; }
            let vue = getVueById(this._storageVueBinding);
            if (vue === undefined) { return false; }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                vue.crate();
            }

            return true;
        }

        /**
         * @param {number} count
         */
        tryConstructContainer(count) {
            if (count === 0) { return true; }
            let vue = getVueById(this._storageVueBinding);
            if (vue === undefined) { return false; }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                vue.container();
            }

            return true;
        }

        // TODO: This value can be slightly inaccurate. Number is taken from UI tooltip, and it doesn't
        // updates in realtime when you getting plasmids(and bonus to storage) from gene sequencing.
        // It can be worked around - importing crateValue() from game, importing spatialReasoning() and
        // rewriting it, opening modal to redraw tooltip with actual data, etc... but that's all quite
        // tedious, and this issue probably doesn't worth such hussle, as inaccuracity inlikely will
        // be more than a couple of percents. And even that will be eventually fixed, when tooltips
        // will be redrawn. But if there will be easier way to fix it eventually - it would be nice to do so.
        getCrateVolume() {
            let crateDescNumbers = $("div#createHead .crate .tooltip-content").text().match(/(\d+)/g);
            if (crateDescNumbers.length == 2){ // Should have 2 numbers: cost and volume
              return Number(crateDescNumbers[1]);
            } else {
              return 350;
            }
        }

        // Same as above
        getContainerVolume() {
            let containerDescNumbers = $("div#createHead .container .tooltip-content").text().match(/(\d+)/g);
            if (containerDescNumbers.length == 2){ // Should have 2 numbers: cost and volume
              return Number(containerDescNumbers[1]);
            } else {
              return 800;
            }
        }
    }

    class Race {
        /**
         * @param {String} id
         * @param {String} name
         * @param {Function} evolutionCondition
         * @param {string} evolutionConditionText
         * @param {string} achievementText
         */
        constructor(id, name, evolutionCondition, evolutionConditionText, achievementText) {
            this.id = id;
            this.name = name;
            this.evolutionCondition = evolutionCondition;
            this.evolutionConditionText = evolutionConditionText;
            this.achievementText = achievementText;

            /** @type {Action[]} */
            this.evolutionTree = [];
        }

        /**
         * @param {number} [level]
         */
        isMadAchievementUnlocked(level) {
            return isAchievementUnlocked("extinct_" + this.id, level);
        }
    }

    class Technology {
        constructor(action) {
            this._id = action.id.substring(5);
            this._action = action;

            this._vueBinding = this._action.id;
            this._definition = null;

            /** @type {ResourceRequirement[]} */
            this.resourceRequirements = [];
        }

        get id() {
            return this._id;
        }

        isUnlocked() {
            return document.querySelector("#" + this._action.id + " > a") !== null && getVueById(this._vueBinding) !== undefined;
        }

        get definition() {
            return this._action;
        }

        get title() {
            return typeof this.definition.title === 'string' ? this.definition.title : this.definition.title();
        }

        // Whether the action is clickable is determined by whether it is unlocked, affordable and not a "permanently clickable" action
        isClickable() {
            if (!this.isUnlocked()) {
                return false;
            }

            if (!game.checkAffordable(this.definition, false)) {
                return false;
            }

            return true;
        }

        /**
         * This is a "safe" click. It will only click if the container is currently clickable.
         * ie. it won't bypass the interface and click the node if it isn't clickable in the UI.
         */
        click() {
            if (!this.isClickable()) {
                return false
            }

            getVueById(this._vueBinding).action();

            state.log.logSuccess(loggingTypes.research, `${techIds[this._action.id].title} has been researched.`);
            return true;
        }

        isResearched() {
            return game.checkOldTech(this.id);
        }

        /**
         * @param {string} resourceId
         */
        resourceCost(resourceId) {
            if (!this.definition.cost[resourceId]) { return 0; }
            return this.definition.cost[resourceId]();
        }

        updateResourceRequirements() {
            if (!this.isUnlocked()) {
                return;
            }

            let resourceIndex = 0;
            let newCosts = game.adjustCosts(this.definition.cost);

            Object.keys(newCosts).forEach(resourceName => {
                let testCost = Number(newCosts[resourceName]()) || 0;

                if (this.resourceRequirements.length > resourceIndex) {
                    this.resourceRequirements[resourceIndex].resource = resources[resourceName];
                    this.resourceRequirements[resourceIndex].quantity = testCost;
                } else {
                    this.resourceRequirements.push(new ResourceRequirement(resources[resourceName], testCost));
                }

                resourceIndex++;
            });

            // Remove any extra elements that we have that are greater than the current number of requirements
            while (this.resourceRequirements.length > resourceIndex) {
                this.resourceRequirements.pop();
            }
        }
    }

    class Trigger {
        /**
         * @param {number} seq
         * @param {number} priority
         * @param {string} requirementType
         * @param {string} requirementId
         * @param {number} requirementCount
         * @param {string} actionType
         * @param {string} actionId
         * @param {number} actionCount
         */
        constructor(seq, priority, requirementType, requirementId, requirementCount, actionType, actionId, actionCount) {
            this.seq = seq;
            this.priority = priority;

            this.requirementType = requirementType;
            this.requirementId = requirementId;
            this.requirementCount = requirementCount;

            this.actionType = actionType;
            this.actionId = actionId;
            this.actionCount = actionCount;

            this.complete = false;
        }

        get desc() {
            let label = "";
            // Actions
            if (this.actionType === "research") {
                label += `Research ${tech[this.actionId].title}`;
            }
            if (this.actionType === "build") {
                label += `Build ${this.actionCount} ${buildingIds[this.actionId].name}`;
            }

            label += ` when `;

            // Requirements
            if (this.requirementType === "unlocked") {
                label += `${tech[this.requirementId].title} available`;
            }
            if (this.requirementType === "researched") {
                label += `${tech[this.requirementId].title} researched`;
            }
            if (this.requirementType === "built") {
                label += `${this.requirementCount} ${buildingIds[this.requirementId].name} built`;
            }
            return label;
        }

        get cost() {
            if (this.actionType === "research") {
                return tech[this.actionId].definition.cost;
            }
            if (this.actionType === "build") {
                return buildingIds[this.actionId].definition.cost;
            }
        }

        isActionPossible() {
            // check against MAX as we want to know if it is possible...
            if (this.actionType === "research") {
                return tech[this.actionId].isUnlocked() && game.checkAffordable(tech[this.actionId].definition, true);
            }
            if (this.actionType === "build") {
                return buildingIds[this.actionId].isUnlocked() && game.checkAffordable(buildingIds[this.actionId].definition, true);
            }
        }

        /** @return {boolean} */
        updateComplete() {
            if (this.complete) {
                return false;
            }

            if (this.actionType === "research") {
                if (tech[this.actionId].isResearched()) {
                    this.complete = true;
                    return true;
                }
            }
            if (this.actionType === "build") {
                if (buildingIds[this.actionId].count >= this.actionCount) {
                    this.complete = true;
                    return true;
                }
            }
            return false;
        }

        areRequirementsMet() {
            if (this.requirementType === "unlocked") {
                if (tech[this.requirementId].isUnlocked()) {
                    return true;
                }
            }
            if (this.requirementType === "researched") {
                if (tech[this.requirementId].isResearched()) {
                    return true;
                }
            }
            if (this.requirementType === "built") {
                if (buildingIds[this.requirementId].count >= this.requirementCount) {
                    return true;
                }
            }
            return false;
        }

        /** @param {string} requirementType */
        updateRequirementType(requirementType) {
            if (requirementType === this.requirementType) {
                return;
            }

            let oldType = this.requirementType;
            this.requirementType = requirementType;
            this.complete = false;

            if ((this.requirementType === "unlocked" || this.requirementType === "researched") &&
                (oldType === "unlocked" || oldType === "researched")) {
                return; // Both researches, old ID is still valid, and preserved.
            }

            if (this.requirementType === "unlocked" || this.requirementType === "researched") {
                this.requirementId = "club";
                this.requirementCount = 0;
                return;
            }

            if (this.requirementType === "built") {
                this.requirementId = "city-basic_housing";
                this.requirementCount = 1;
                return;
            }
        }

        /** @param {string} requirementId */
        updateRequirementId(requirementId) {
            if (requirementId === this.requirementId) {
                return;
            }

            this.requirementId = requirementId;
            this.complete = false;

            // changing id doesn't change other requirements
        }

        /** @param {number} requirementCount */
        updateRequirementCount(requirementCount) {
            if (requirementCount === this.requirementCount) {
                return;
            }

            this.requirementCount = requirementCount;
            this.complete = false;

            // changing count doesn't change other requirements
        }

        /** @param {string} actionType */
        updateActionType(actionType) {
            if (actionType === this.actionType) {
                return;
            }

            this.actionType = actionType;
            this.complete = false;

            if (this.actionType === "research") {
                this.actionId = "club";
                this.actionCount = 0;
                return;
            }

            if (this.actionType === "build") {
                this.actionId = "city-basic_housing";
                this.actionCount = 1;
                return;
            }
        }

        /** @param {string} actionId */
        updateActionId(actionId) {
            if (actionId === this.actionId) {
                return;
            }

            this.actionId = actionId;
            this.complete = false;
        }

        /** @param {number} actionCount */
        updateActionCount(actionCount) {
            if (actionCount === this.actionCount) {
                return;
            }

            this.actionCount = actionCount;
            this.complete = false;
        }
    }

    class TriggerManager {
        constructor() {
            /** @type {Trigger[]} */
            this.priorityList = [];

            /** @type {Trigger[]} */
            this._targetTriggers = null;
        }

        get targetTriggers() {
            if (this._targetTriggers === null) {
                this._targetTriggers = [];

                //console.log(this.priorityList.length)

                this.priorityList.forEach(trigger => {
                    //console.log("trigger " + trigger.complete + " is possible? " + trigger.isActionPossible() + " conflicts? " + this.actionConflicts(trigger))
                    if (!trigger.complete && trigger.areRequirementsMet() && trigger.isActionPossible() && !this.actionConflicts(trigger)) {
                        this._targetTriggers.push(trigger);
                    }
                });
            }

            return this._targetTriggers;
        }

        resetTargetTriggers() {
            //console.log("resetting")
            this._targetTriggers = null;
        }

        updateCompleteTriggers() {
            let resetTargets = false;

            for (let i = 0; i < this.priorityList.length; i++) {
                const trigger = this.priorityList[i];
                if (trigger.updateComplete()) {
                    resetTargets = true;
                }
            }

            if (resetTargets) {
                state.triggerManager.resetTargetTriggers();
            }
        }

        /**
         * @param {any} seq
         * @return {Trigger}
         */
        getTrigger(seq) {
            return this.priorityList.find(trigger => trigger.seq === seq);
        }

        clearPriorityList() {
            this.priorityList.length = 0;
        }

        sortByPriority() {
            this.priorityList.sort(function (a, b) { return a.priority - b.priority } );
        }

        /** @return {Trigger} */
        AddTrigger(requirementType, requirementId, requirementCount, actionType, actionId, actionCount) {
            let trigger = new Trigger(this.priorityList.length, this.priorityList.length, requirementType, requirementId, requirementCount, actionType, actionId, actionCount);
            this.priorityList.push(trigger);
            return trigger;
        }

        AddTriggerFromSetting(seq, priority, requirementType, requirementId, requirementCount, actionType, actionId, actionCount) {
            let existingSequence = this.priorityList.some(trigger => trigger.seq === seq);
            if (!existingSequence) {
                let trigger = new Trigger(seq, priority, requirementType, requirementId, requirementCount, actionType, actionId, actionCount);
                this.priorityList.push(trigger);
            }
        }

        /** @param {number} seq */
        RemoveTrigger(seq) {
            let indexToRemove = this.priorityList.findIndex(trigger => trigger.seq === seq);

            if (indexToRemove === -1) {
                return;
            }

            this.priorityList.splice(indexToRemove, 1);

            for (let i = 0; i < this.priorityList.length; i++) {
                const trigger = this.priorityList[i];
                trigger.seq = i;
            }
        }

        /**
         * Helper function that checks if the costs of a trigger and an action conflict.
         * Multiplier is applied to actionCosts, this is needed for ARPA
         * @param {Object} origTriggerCosts
         * @param {Object} origActionCosts
         * @param {Number} multiplier
         * @return {boolean}
        */
        costsConflict(origTriggerCosts, origActionCosts, multiplier = 1) {
            if (!origTriggerCosts || !origActionCosts) {
                return false;
            }

            const triggerCosts = game.adjustCosts(origTriggerCosts);
            const actionCosts = game.adjustCosts(origActionCosts);
            // console.log("triggerCosts");
            // Object.keys(triggerCosts).forEach(ele => (console.log(ele + ' ' + triggerCosts[ele]())));
            // console.log("actionCosts");
            // Object.keys(actionCosts).forEach(ele => (console.log(ele + ' ' + actionCosts[ele]() * multiplier)));

            // Only block Knowledge spending if there is a Knowledge cost to the Trigger and all other resource demands are already met
            let triggerBlocksKnowledge = false;
            // @ts-ignore
            if (Object.keys(triggerCosts).includes("Knowledge")) {
                // Check if all other costs can be paid out of storage
                if (Object.keys(triggerCosts).every(res => res === "Knowledge" || triggerCosts[res]() <= game.global.resource[res].amount)) {
                    triggerBlocksKnowledge = true;
                }
            }
            // console.log("triggerBlocksKnowledge " + triggerBlocksKnowledge)

            // Log the checks of the next if for each resource
            // Object.keys(triggerCosts).forEach(res => (console.log(res + ' ' + (triggerBlocksKnowledge || res != "Knowledge") + ' '
            //                                          + Object.keys(actionCosts).includes(res) + ' '
            //                                          + (Object.keys(actionCosts).includes(res) &&
            //                                              (triggerCosts[res]() >= game.global.resource[res].amount - actionCosts[res]() * multiplier)))));

            if (Object.keys(triggerCosts).some(res => (triggerBlocksKnowledge || res != "Knowledge")       // Only block Knowledge if we need to
                                                    // @ts-ignore
                                                    && Object.keys(actionCosts).includes(res)           // Check if the Trigger resource is required by the action
                                                    && (!game.global.resource[res]                      // The next check is only done for "normal" resources, other ones are always blocked if needed by both
                                                        || (game.global.resource[res]                   // Only block if we can't afford the trigger after doing the action
                                                            && triggerCosts[res]() > game.global.resource[res].amount - actionCosts[res]() * multiplier)))) {
                return true;
            }

            return false;
        }

        /**
         * This function only checks if two triggers use the same resource, it does not check storage
         * @param {Trigger} trigger
         * @return {boolean}
         */
        actionConflicts(trigger) {
            if (this._targetTriggers === null) {
                return false;
            }

            for (let i = 0; i < this._targetTriggers.length; i++) {
                const targetTrigger = this._targetTriggers[i];

                //@ts-ignore
                if (Object.keys(targetTrigger.cost).some(cost => Object.keys(trigger.cost).includes(cost))) {
                    return true;
                }
            }

            return false;
        }

        /**
         * @param {Action} building
         * @return {boolean}
         */
        buildingConflicts(building) {
            for (let i = 0; i < this.targetTriggers.length; i++) {
                const targetTrigger = this.targetTriggers[i];

                if (this.costsConflict(targetTrigger.cost, building.definition.cost)) {
                    //console.log("building " + building.id + " CONFLICTS with target")
                    return targetTrigger;
                }
            }

            return false;
        }

        /**
         * @param {Project} project
         * @return {boolean}
         */
        projectConflicts(project) {
            for (let i = 0; i < this.targetTriggers.length; i++) {
                const targetTrigger = this.targetTriggers[i];

                //@ts-ignore
                // Divide costs by 100 to get the cost for a single segment and subtract the creative flat bonus
                if (this.costsConflict(targetTrigger.cost, project.definition.cost, 0.01 * (game.global.race[racialTraitCreative] ? 0.8 : 1))) {

                    //console.log("project " + project.id + " CONFLICTS with target")
                    return true;
                }
            }

            return false;
        }

        /**
         * @param {Action} research
         * @return {boolean}
         */
        researchConflicts(research) {
            for (let i = 0; i < this.targetTriggers.length; i++) {
                const targetTrigger = this.targetTriggers[i];
                //@ts-ignore
                if (this.costsConflict(targetTrigger.cost, research.definition.cost)) {

                    //console.log("research " + research.id + " CONFLICTS with target")
                    return true;
                }
            }

            return false;
        }
    }

    //#endregion Class Declarations

    //#region State and Initialisation

    var tech = {};
    var techIds = {};

    var weightingRules = null;

    // Data attribtes have IDs in lower case for some reason, we're going to use it as lookup table
    var resLowIds = {};

    // Lookup table for buildings
    var buildingIds = {}

    function alwaysAllowed() {
        return true;
    }

    function neverAllowed() {
        return false;
    }

    function demonicAllowed() {
        return game.global.city.biome === 'hellscape' || game.global.blood['unbound'] && game.global.blood.unbound >= 3;
    }

    function celestialAllowed() {
        return game.global.city.biome === 'eden' || game.global.blood['unbound'] && game.global.blood.unbound >= 3;
    }

    function aquaticAllowed() {
        return game.global.city.biome === 'oceanic' || game.global.blood['unbound'];
    }

    function feyAllowed() {
        return game.global.city.biome === 'forest' || game.global.blood['unbound'];
    }

    function sandAllowed() {
        return game.global.city.biome === 'desert' || game.global.blood['unbound'];
    }

    function heatAllowed() {
        return game.global.city.biome === 'volcanic' || game.global.blood['unbound'];
    }

    function polarAllowed() {
        return game.global.city.biome === 'tundra' || game.global.blood['unbound'];
    }

    function customAllowed() {
        if (!game.races.custom.hasOwnProperty('type')) {
            return false;
        }

        switch (game.races.custom.type) {
            case 'aquatic':
                return aquaticAllowed();
            case 'fey':
                return feyAllowed();
            case 'sand':
                return sandAllowed();
            case 'heat':
                return heatAllowed();
            case 'polar':
                return polarAllowed();
            case 'demonic':
                return demonicAllowed();
            case 'angelic':
                return celestialAllowed();
            default:
                return true;
        }
    }

    var races = {
        antid: new Race("antid", "Antid", alwaysAllowed, "", "Ophiocordyceps Unilateralis"),
        mantis: new Race("mantis", "Mantis", alwaysAllowed, "", "Praying Unanswered"),
        scorpid: new Race("scorpid", "Scorpid", alwaysAllowed, "", "Pulmonoscorpius"),
        human: new Race("human", "Human", alwaysAllowed, "", "Homo Adeadus"),
        orc: new Race("orc", "Orc", alwaysAllowed, "", "Outlander"),
        elven: new Race("elven", "Elf", alwaysAllowed, "", "The few, the proud, the dead"),
        troll: new Race("troll", "Troll", alwaysAllowed, "", "Bad Juju"),
        ogre: new Race("ogre", "Ogre", alwaysAllowed, "", "Too stupid to live"),
        cyclops: new Race("cyclops", "Cyclops", alwaysAllowed, "", "Blind Ambition"),
        kobold: new Race("kobold", "Kobold", alwaysAllowed, "", "Took their candle"),
        goblin: new Race("goblin", "Goblin", alwaysAllowed, "", "Greed before Need"),
        gnome: new Race("gnome", "Gnome", alwaysAllowed, "", "Unathletic"),
        cath: new Race("cath", "Cath", alwaysAllowed, "", "Saber Tooth Tiger"),
        wolven: new Race("wolven", "Wolven", alwaysAllowed, "", "Dire Wolf"),
        centaur: new Race("centaur", "Centaur", alwaysAllowed, "", "Ferghana"),
        balorg: new Race("balorg", "Balorg", demonicAllowed, "Hellscape planet", "Self immolation"),
        imp: new Race("imp", "Imp", demonicAllowed, "Hellscape planet", "Deal with the devil"),
        seraph: new Race("seraph", "Seraph", celestialAllowed, "Eden planet", "Fallen Angel"),
        unicorn: new Race("unicorn", "Unicorn", celestialAllowed, "Eden planet", "Unicorn Burgers"),
        arraak: new Race("arraak", "Arraak", alwaysAllowed, "", "Way of the Dodo"),
        pterodacti: new Race("pterodacti", "Pterodacti", alwaysAllowed, "", "Chicxulub"),
        dracnid: new Race("dracnid", "Dracnid", alwaysAllowed, "", "Desolate Smaug"),
        tortoisan: new Race("tortoisan", "Tortoisan", alwaysAllowed, "", "Circle of Life"),
        gecko: new Race("gecko", "Gecko", alwaysAllowed, "", "No Savings"),
        slitheryn: new Race("slitheryn", "Slitheryn", alwaysAllowed, "", "Final Shedding"),
        sharkin: new Race("sharkin", "Sharkin", aquaticAllowed, "Oceanic planet", "Megalodon"),
        octigoran: new Race("octigoran", "Octigoran", aquaticAllowed, "Oceanic planet", "Calamari"),
        entish: new Race("entish", "Ent", alwaysAllowed, "", "Saruman's Revenge"),
        cacti: new Race("cacti", "Cacti", alwaysAllowed, "", "Desert Deserted"),
        pinguicula: new Race("pinguicula", "Pinguicula", alwaysAllowed, "", "Weed Whacker"),
        sporgar: new Race("sporgar", "Sporgar", alwaysAllowed, "", "Fungicide"),
        shroomi: new Race("shroomi", "Shroomi", alwaysAllowed, "", "Bad Trip"),
        moldling: new Race("moldling", "Moldling", alwaysAllowed, "", "Digested"),
        junker: new Race("junker", "Valdi", neverAllowed, "Challenge genes unlocked", "Euthanasia"),
        dryad: new Race("dryad", "Dryad", feyAllowed, "Forest planet", "Ashes to Ashes"),
        satyr: new Race("satyr", "Satyr", feyAllowed, "Forest planet", "Stopped the music"),
        phoenix: new Race("phoenix", "Phoenix", heatAllowed, "Volcanic planet", "Snuffed"),
        salamander: new Race("salamander", "Salamander", heatAllowed, "Volcanic planet", "Cooled Off"),
        yeti: new Race("yeti", "Yeti", polarAllowed, "Tundra planet", "Captured"),
        wendigo: new Race("wendigo", "Wendigo", polarAllowed, "Tundra planet", "Soulless Abomination"),
        tuskin: new Race("tuskin", "Tuskin", sandAllowed, "Desert planet", "Startled"),
        kamel: new Race("kamel", "Kamel", sandAllowed, "Desert planet", "No Oasis"),
        custom: new Race("custom", "Custom", customAllowed, "Custom designed race", "Lab Failure"),
    }

    /** @type {Race[]} */
    var raceAchievementList = [
        races.antid, races.mantis, races.scorpid, races.human, races.orc, races.elven, races.troll, races.ogre, races.cyclops,
        races.kobold, races.goblin, races.gnome, races.cath, races.wolven, races.centaur, races.balorg, races.imp, races.seraph, races.unicorn,
        races.arraak, races.pterodacti, races.dracnid, races.tortoisan, races.gecko, races.slitheryn, races.sharkin, races.octigoran,
        races.entish, races.cacti, races.pinguicula, races.sporgar, races.shroomi, races.moldling, races.junker, races.dryad, races.satyr, races.phoenix, races.salamander,
        races.yeti, races.wendigo, races.tuskin, races.kamel, races.custom
    ];

    var universes = ['standard','heavy','antimatter','evil','micro','magic'];

    var planetBiomes = ["grassland", "forest", "oceanic", "desert", "volcanic", "tundra", "hellscape", "eden"];
    var planetTraits = ["rage", "elliptical", "stormy", "toxic", "magnetic", "ozone", "mellow", "trashed", "flare", "unstable", "dense"];
    var planetBiomeRaces = {
        hellscape: ["balorg", "imp"],
        eden: ["seraph", "unicorn"],
        oceanic: ["sharkin", "octigoran"],
        forest: ["dryad", "satyr"],
        desert: ["tuskin", "kamel"],
        volcanic: ["phoenix", "salamander"],
        tundra: ["yeti", "wendigo"]
    }

    var evolutionSettingsToStore = ["userEvolutionTarget", "prestigeType", "challenge_plasmid", "challenge_mastery", "challenge_trade",
                                    "challenge_craft", "challenge_crispr", "challenge_joyless", "challenge_decay", "challenge_steelen",
                                    "challenge_emfield", "challenge_cataclysm", "challenge_junker"];

    var resources = {
        // Evolution resources
        RNA: new Resource("RNA", "RNA"),
        DNA: new Resource("DNA", "DNA"),

        // Base resources
        Money: new Resource("Money", "Money"),
        Population: new Population(), // We can't store the full elementId because we don't know the name of the population node until later
        Slave: new Resource("Slave", "Slave"),
        Mana: new Resource("Mana", "Mana"),
        Knowledge: new Resource("Knowledge", "Knowledge"),
        Crates: new Resource("Crates", "Crates"),
        Containers: new Resource("Containers", "Containers"),
        Plasmid: new SpecialResource("Plasmid", "Plasmid"),
        Antiplasmid: new SpecialResource("Anti-Plasmid", "AntiPlasmid"),
        Phage: new SpecialResource("Phage", "Phage"),
        Dark: new SpecialResource("Dark", "Dark"),
        Harmony: new SpecialResource("Harmony", "Harmony"),
        Genes: new Resource("Genes", "Genes"),

        // Special not-really-resources-but-we'll-treat-them-like-resources resources
        Power: new Power(),
        Moon_Support: new Support("Moon Support", "srspc_moon", "space", "spc_moon"),
        Red_Support: new Support("Red Support", "srspc_red", "space", "spc_red"),
        Sun_Support: new Support("Sun Support", "srspc_sun", "space", "spc_sun"),
        Belt_Support: new Support("Belt Support", "srspc_belt", "space", "spc_belt"),
        Alpha_Support: new Support("Alpha Support", "srint_alpha", "interstellar", "int_alpha"),
        Nebula_Support: new Support("Nebula Support", "srint_nebula", "interstellar", "int_nebula"),

        // Basic resources (can trade for these)
        Food: new Resource("Food", "Food"),
        Lumber: new Resource("Lumber", "Lumber"),
        Stone: new Resource("Stone", "Stone"),
        Crystal: new Resource("Crystal", "Crystal"),
        Furs: new Resource("Furs", "Furs"),
        Copper: new Resource("Copper", "Copper"),
        Iron: new Resource("Iron", "Iron"),
        Aluminium: new Resource("Aluminium", "Aluminium"),
        Cement: new Resource("Cement", "Cement"),
        Coal: new Resource("Coal", "Coal"),
        Oil: new Resource("Oil", "Oil"),
        Uranium: new Resource("Uranium", "Uranium"),
        Steel: new Resource("Steel", "Steel"),
        Titanium: new Resource("Titanium", "Titanium"),
        Alloy: new Resource("Alloy", "Alloy"),
        Polymer: new Resource("Polymer", "Polymer"),
        Iridium: new Resource("Iridium", "Iridium"),
        Helium_3: new Resource("Helium-3", "Helium_3"),

        // Advanced resources (can't trade for these)
        Elerium: new Resource("Elerium", "Elerium"),
        Neutronium: new Resource("Neutronium", "Neutronium"),
        Nano_Tube: new Resource("Nano Tube", "Nano_Tube"),

        // Interstellar
        Deuterium: new Resource("Deuterium", "Deuterium"),
        Adamantite: new Resource("Adamantite", "Adamantite"),
        Infernite: new Resource("Infernite", "Infernite"),
        Graphene: new Resource("Graphene", "Graphene"),
        Stanene: new Resource("Stanene", "Stanene"),
        Soul_Gem: new Resource("Soul Gem", "Soul_Gem"),

        // Andromeda
        Bolognium: new Resource("Bolognium", "Bolognium"),
        Vitreloy: new Resource("Vitreloy", "Vitreloy"),
        Orichalcum: new Resource("Orichalcum", "Orichalcum"),

        // Craftable resources
        Plywood: new Resource("Plywood", "Plywood"),
        Brick: new Resource("Brick", "Brick"),
        Wrought_Iron: new Resource("Wrought Iron", "Wrought_Iron"),
        Sheet_Metal: new Resource("Sheet Metal", "Sheet_Metal"),
        Mythril: new Resource("Mythril", "Mythril"),
        Aerogel: new Resource("Aerogel", "Aerogel"),
        Nanoweave: new Resource("Nanoweave", "Nanoweave"),
        Scarletite: new Resource("Scarletite", "Scarletite"),

        // Magic universe update
        Corrupt_Gem: new Resource("Corrupt Gem", "Corrupt_Gem"),
        Codex: new Resource("Codex", "Codex"),
        Demonic_Essence: new Resource("Demonic Essence", "Demonic_Essence"),
        Blood_Stone: new Resource("Blood Stone", "Blood_Stone"),
        Artifact: new Resource("Artifact", "Artifact"),
    }

    var state = {
        loopCounter: 1,

        lastPopulationCount: Number.MAX_SAFE_INTEGER,
        lastFarmerCount: Number.MAX_SAFE_INTEGER,

        log: new GameLog(),
        multiplier: new Multiplier(),
        windowManager: new ModalWindowManager(),
        warManager: new WarManager(),
        jobManager: new JobManager(),
        buildingManager: new BuildingManager(),
        projectManager: new ProjectManager(),
        marketManager: new MarketManager(),
        storageManager: new StorageManager(),
        minorTraitManager: new MinorTraitManager(),
        triggerManager: new TriggerManager(),
        governmentManager: new GovernmentManager(),
        spyManager: new SpyManager(),

        minimumMoneyAllowed: 0,

        knowledgeRequiredByTechs: 0,
        oilRequiredByMissions: 0,
        heliumRequiredByMissions: 0,

        goal: "Standard",

        /** @type {Resource[]} */
        craftableResourceList: [],

        jobs: {
            Farmer: new Job("farmer", "Farmer"),
            Lumberjack: new Job("lumberjack", "Lumberjack"),
            QuarryWorker: new Job("quarry_worker", "Quarry Worker"),
            CrystalMiner: new Job("crystal_miner", "Crystal Miner"),
            Scavenger: new Job("scavenger", "Scavenger"),

            Miner: new Job("miner", "Miner"),
            CoalMiner: new Job("coal_miner", "Coal Miner"),
            CementWorker: new Job("cement_worker", "Cement Worker"),
            Entertainer: new Job("entertainer", "Entertainer"),
            Priest: new Job("priest", "Priest"),
            Professor: new Job("professor", "Professor"),
            Scientist: new Job("scientist", "Scientist"),
            Banker: new Job("banker", "Banker"),
            Colonist: new Job("colonist", "Colonist"),
            SpaceMiner: new Job("space_miner", "Space Miner"),
            HellSurveyor: new Job("hell_surveyor", "Hell Surveyor"),

            // Crafting jobs
            Plywood: new CraftingJob("Plywood", "Plywood Crafter", resources.Plywood),
            Brick: new CraftingJob("Brick", "Brick Crafter", resources.Brick),
            WroughtIron: new CraftingJob("Wrought_Iron", "Wrought Iron Crafter", resources.Wrought_Iron),
            SheetMetal: new CraftingJob("Sheet_Metal", "Sheet Metal Crafter", resources.Sheet_Metal),
            Mythril: new CraftingJob("Mythril", "Mythril Crafter", resources.Mythril),
            Aerogel: new CraftingJob("Aerogel", "Aerogel Crafter", resources.Aerogel),
            Nanoweave: new CraftingJob("Nanoweave", "Nanoweave Crafter", resources.Nanoweave),
            Scarletite: new CraftingJob("Scarletite", "Scarletite Crafter", resources.Scarletite),
        },

        evolutions: {
            Rna: new EvolutionAction("RNA", "evo", "rna", ""),
            Dna: new EvolutionAction("DNA", "evo", "dna", ""),
            Membrane: new EvolutionAction("Membrane", "evo", "membrane", ""),
            Organelles: new EvolutionAction("Organelles", "evo", "organelles", ""),
            Nucleus: new EvolutionAction("Nucleus", "evo", "nucleus", ""),
            EukaryoticCell: new EvolutionAction("Eukaryotic Cell", "evo", "eukaryotic_cell", ""),
            Mitochondria: new EvolutionAction("Mitochondria", "evo", "mitochondria", ""),

            SexualReproduction: new EvolutionAction("", "evo", "sexual_reproduction", ""),
                Phagocytosis: new EvolutionAction("", "evo", "phagocytosis", ""),
                    Multicellular: new EvolutionAction("", "evo", "multicellular", ""),
                        BilateralSymmetry: new EvolutionAction("", "evo", "bilateral_symmetry", ""),
                            Arthropods: new EvolutionAction("", "evo", "athropods", ""),
                                Sentience: new EvolutionAction("", "evo", "sentience", ""),
                                Mantis: new EvolutionAction("", "evo", "mantis", ""),
                                Scorpid: new EvolutionAction("", "evo", "scorpid", ""),
                                Antid: new EvolutionAction("Antid", "evo", "antid", ""),

                            Mammals: new EvolutionAction("", "evo", "mammals", ""),
                                Humanoid: new EvolutionAction("", "evo", "humanoid", ""),
                                    Human: new EvolutionAction("", "evo", "human", ""),
                                    Orc: new EvolutionAction("", "evo", "orc", ""),
                                    Elven: new EvolutionAction("", "evo", "elven", ""),
                                    Valdi: new EvolutionAction("", "evo", "junker", ""), // junker challenge
                                Gigantism: new EvolutionAction("", "evo", "gigantism", ""),
                                    Troll: new EvolutionAction("", "evo", "troll", ""),
                                    Ogre: new EvolutionAction("", "evo", "ogre", ""),
                                    Cyclops: new EvolutionAction("", "evo", "cyclops", ""),
                                Dwarfism: new EvolutionAction("", "evo", "dwarfism", ""),
                                    Kobold: new EvolutionAction("", "evo", "kobold", ""),
                                    Goblin: new EvolutionAction("", "evo", "goblin", ""),
                                    Gnome: new EvolutionAction("", "evo", "gnome", ""),
                                Animalism: new EvolutionAction("", "evo", "animalism", ""),
                                    Cath: new EvolutionAction("", "evo", "cath", ""),
                                    Wolven: new EvolutionAction("", "evo", "wolven", ""),
                                    Centaur: new EvolutionAction("", "evo", "centaur", ""),
                                Demonic: new EvolutionAction("", "evo", "demonic", ""), // hellscape only
                                    Balorg: new EvolutionAction("", "evo", "balorg", ""),
                                    Imp: new EvolutionAction("", "evo", "imp", ""),
                                Celestial: new EvolutionAction("", "evo", "celestial", ""), // eden only
                                    Seraph: new EvolutionAction("", "evo", "seraph", ""),
                                    Unicorn: new EvolutionAction("", "evo", "unicorn", ""),
                                Fey: new EvolutionAction("", "evo", "fey", ""), // forest only
                                    Dryad: new EvolutionAction("", "evo", "dryad", ""),
                                    Satyr: new EvolutionAction("", "evo", "satyr", ""),
                                Heat: new EvolutionAction("", "evo", "heat", ""), // volcanic only
                                    Phoenix: new EvolutionAction("", "evo", "phoenix", ""),
                                    Salamander: new EvolutionAction("", "evo", "salamander", ""),
                                Polar: new EvolutionAction("", "evo", "polar", ""), // tundra only
                                    Yeti: new EvolutionAction("", "evo", "yeti", ""),
                                    Wendigo: new EvolutionAction("", "evo", "wendigo", ""),
                                Sand: new EvolutionAction("", "evo", "sand", ""), // desert only
                                    Tuskin: new EvolutionAction("", "evo", "tuskin", ""),
                                    Kamel: new EvolutionAction("", "evo", "kamel", ""),

                            Eggshell: new EvolutionAction("", "evo", "eggshell", ""),
                                Endothermic: new EvolutionAction("", "evo", "endothermic", ""),
                                    Arraak: new EvolutionAction("", "evo", "arraak", ""),
                                    Pterodacti: new EvolutionAction("", "evo", "pterodacti", ""),
                                    Dracnid: new EvolutionAction("", "evo", "dracnid", ""),

                                Ectothermic: new EvolutionAction("", "evo", "ectothermic", ""),
                                    Tortoisan: new EvolutionAction("", "evo", "tortoisan", ""),
                                    Gecko: new EvolutionAction("", "evo", "gecko", ""),
                                    Slitheryn: new EvolutionAction("", "evo", "slitheryn", ""),

                            Aquatic: new EvolutionAction("", "evo", "aquatic", ""), // ocean only
                                Sharkin: new EvolutionAction("", "evo", "sharkin", ""),
                                Octigoran: new EvolutionAction("", "evo", "octigoran", ""),

                Custom: new EvolutionAction("", "evo", "custom", ""),

                Chloroplasts: new EvolutionAction("", "evo", "chloroplasts", ""),
                    //Multicellular: new EvolutionAction("", "evo", "multicellular", ""),
                        Poikilohydric: new EvolutionAction("", "evo", "poikilohydric", ""),
                            Bryophyte: new EvolutionAction("", "evo", "bryophyte", ""),
                                Entish: new EvolutionAction("", "evo", "entish", ""),
                                Cacti: new EvolutionAction("", "evo", "cacti", ""),
                                Pinguicula: new EvolutionAction("", "evo", "pinguicula", ""),


                Chitin: new EvolutionAction("", "evo", "chitin", ""),
                    //Multicellular: new EvolutionAction("", "evo", "multicellular", ""),
                        Spores: new EvolutionAction("", "evo", "spores", ""),
                            //Bryophyte: new EvolutionAction("", "evo", "bryophyte", ""),
                                Sporgar: new EvolutionAction("", "evo", "sporgar", ""),
                                Shroomi: new EvolutionAction("", "evo", "shroomi", ""),
                                Moldling: new EvolutionAction("", "evo", "moldling", ""),


            Bunker: new ChallengeEvolutionAction("", "evo", "bunker", "", ""),
            Plasmid: new ChallengeEvolutionAction("Plasmid", "evo", "plasmid", "", "no_plasmid"),
            Trade: new ChallengeEvolutionAction("Trade", "evo", "trade", "", "no_trade"),
            Craft: new ChallengeEvolutionAction("Craft", "evo", "craft", "", "no_craft"),
            Crispr: new ChallengeEvolutionAction("Crispr", "evo", "crispr", "", "no_crispr"),
            Mastery: new ChallengeEvolutionAction("Mastery", "evo", "mastery", "", "weak_mastery"),
            Joyless: new ChallengeEvolutionAction("Joyless", "evo", "joyless", "", "joyless"),
            Decay: new ChallengeEvolutionAction("Decay", "evo", "decay", "", "decay"),
            Junker: new ChallengeEvolutionAction("Junker", "evo", "junker", "", "junker"),
            Steelen: new ChallengeEvolutionAction("Steelen", "evo", "steelen", "", "steelen"),
            EmField: new ChallengeEvolutionAction("EM Field", "evo", "emfield", "", "emfield"),
            Cataclysm: new ChallengeEvolutionAction("Cataclysm", "evo", "cataclysm", "", "cataclysm"),

        },// weak_mastery

        /** @type {Race[][]} */
        raceGroupAchievementList: [],
        /** @type {ChallengeEvolutionAction[]} */
        evolutionChallengeList: [],

        /** @type {Race} */
        evolutionTarget: null,
        resetEvolutionTarget: false,
        universeTarget: 'none',

        cityBuildings: {
            Food: new Action("Food", "city", "food", ""),
            Lumber: new Action("Lumber", "city", "lumber", ""),
            Stone: new Action("Stone", "city", "stone", ""),

            Slaughter: new Action("Slaughter", "city", "slaughter", ""),
            SacrificialAltar: new Action("Sacrificial Altar", "city", "s_alter", ""),

            University: new Action("University", "city", "university", "", {knowledge: true}),
            Wardenclyffe: new Action("Wardenclyffe", "city", "wardenclyffe", "", {knowledge: true}),
            Mine: new Action("Mine", "city", "mine", ""),
            CoalMine: new Action("Coal Mine", "city", "coal_mine", ""),
            Smelter: new Smelter(), // has options
            CoalPower: new Action("Coal Powerplant", "city", "coal_power", ""),
            Temple: new Action("Temple", "city", "temple", ""),
            OilWell: new Action("Oil Derrick", "city", "oil_well", ""),
            BioLab: new Action("Bioscience Lab", "city", "biolab", "", {knowledge: true}),
            StorageYard: new Action("Freight Yard", "city", "storage_yard", ""),
            Warehouse: new Action("Container Port", "city", "warehouse", ""),
            OilPower: new Action("Oil Powerplant", "city", "oil_power", ""),
            Bank: new Action("Bank", "city", "bank", ""),
            Barracks: new Action("Barracks", "city", "garrison", "", {garrison: true}),
            Hospital: new Action("Hospital", "city", "hospital", ""),
            BootCamp: new Action("Boot Camp", "city", "boot_camp", ""),
            House: new Action("Cabin", "city", "basic_housing", "", {housing: true}),
            Cottage: new Action("Cottage", "city", "cottage", "", {housing: true}),
            Apartment: new Action("Apartment", "city", "apartment", "", {housing: true}),
            Farm: new Action("Farm", "city", "farm", "", {housing: true}),
            SoulWell: new Action("Soul Well", "city", "soul_well", ""),
            Mill: new Action("Mill (Good Windmill)", "city", "mill", ""),
            Windmill: new Action("Windmill (Evil only)", "city", "windmill", ""),
            Silo: new Action("Grain Silo", "city", "silo", ""),
            Shed: new Action("Shed", "city", "shed", ""),
            LumberYard: new Action("Lumber Yard", "city", "lumber_yard", ""),
            RockQuarry: new Action("Rock Quarry", "city", "rock_quarry", ""),
            CementPlant: new Action("Cement Factory", "city", "cement_plant", ""),
            Foundry: new Action("Foundry", "city", "foundry", ""),
            Factory: new Factory(), // has options
            OilDepot: new Action("Fuel Depot", "city", "oil_depot", ""),
            Trade: new Action("Trade Post", "city", "trade", ""),
            Amphitheatre: new Action("Amphitheatre", "city", "amphitheatre", ""),
            Library: new Action("Library", "city", "library", "", {knowledge: true}),
            Sawmill: new Action("Sawmill", "city", "sawmill", ""),
            FissionPower: new Action("Fission Reactor", "city", "fission_power", ""),
            Lodge: new Action("Lodge", "city", "lodge", "", {housing: true}),
            Smokehouse: new Action("Smokehouse", "city", "smokehouse", ""),
            Casino: new Action("Casino", "city", "casino", ""),
            TouristCenter: new Action("Tourist Center", "city", "tourist_center", ""),
            MassDriver: new Action("Mass Driver", "city", "mass_driver", ""),
            Wharf: new Action("Wharf", "city", "wharf", ""),
            MetalRefinery: new Action("Metal Refinery", "city", "metal_refinery", ""),
            SlavePen: new Action("Slave Pen", "city", "slave_pen", ""),
            SlaveMarket: new Action("Slave Market", "city", "slave_market", ""),
            Graveyard: new Action ("Graveyard", "city", "graveyard", ""),
            Shrine: new Action ("Shrine", "city", "shrine", ""),
            CompostHeap: new Action ("Compost Heap", "city", "compost", ""),

            Pylon: new Action ("Pylon", "city", "pylon", "")
        },

        spaceBuildings: {
            // Space
            SpaceTestLaunch: new Action("Test Launch", "space", "test_launch", "spc_home", {mission: true}),
            SpaceSatellite: new Action("Space Satellite", "space", "satellite", "spc_home", {knowledge: true}),
            SpaceGps: new Action("Space Gps", "space", "gps", "spc_home"),
            SpacePropellantDepot: new Action("Space Propellant Depot", "space", "propellant_depot", "spc_home"),
            SpaceNavBeacon: new Action("Space Navigation Beacon", "space", "nav_beacon", "spc_home"),

            // Moon
            MoonMission: new Action("Moon Mission", "space", "moon_mission", "spc_moon", {mission: true}),
            MoonBase: new Action("Moon Base", "space", "moon_base", "spc_moon"),
            MoonIridiumMine: new Action("Moon Iridium Mine", "space", "iridium_mine", "spc_moon"),
            MoonHeliumMine: new Action("Moon Helium-3 Mine", "space", "helium_mine", "spc_moon"),
            MoonObservatory: new Action("Moon Observatory", "space", "observatory", "spc_moon", {knowledge: true}),

            // Red
            RedMission: new Action("Red Mission", "space", "red_mission", "spc_red", {mission: true}),
            RedSpaceport: new Action("Red Spaceport", "space", "spaceport", "spc_red"),
            RedTower: new Action("Red Space Control", "space", "red_tower", "spc_red"),
            RedLivingQuarters: new Action("Red Living Quarters", "space", "living_quarters", "spc_red", {housing: true}),
            RedVrCenter: new Action("Red VR Center", "space", "vr_center", "spc_red"),
            RedGarage: new Action("Red Garage", "space", "garage", "spc_red"),
            RedMine: new Action("Red Mine", "space", "red_mine", "spc_red"),
            RedFabrication: new Action("Red Fabrication", "space", "fabrication", "spc_red"),
            RedFactory: new Action("Red Factory", "space", "red_factory", "spc_red"),
            RedBiodome: new Action("Red Biodome", "space", "biodome", "spc_red"),
            RedExoticLab: new Action("Red Exotic Materials Lab", "space", "exotic_lab", "spc_red", {knowledge: true}),
            RedSpaceBarracks: new Action("Red Marine Barracks", "space", "space_barracks", "spc_red", {garrison: true}),
            RedZiggurat: new Action("Red Ziggurat", "space", "ziggurat", "spc_red"),

            // Hell
            HellMission: new Action("Hell Mission", "space", "hell_mission", "spc_hell", {mission: true}),
            HellGeothermal: new Action("Hell Geothermal Plant", "space", "geothermal", "spc_hell"),
            HellSpaceCasino: new Action("Hell Space Casino", "space", "spc_casino", "spc_hell"),
            HellSwarmPlant: new Action("Hell Swarm Plant", "space", "swarm_plant", "spc_hell"),

            // Sun
            SunMission: new Action("Sun Mission", "space", "sun_mission", "spc_sun", {mission: true}),
            SunSwarmControl: new Action("Sun Control Station", "space", "swarm_control", "spc_sun"),
            SunSwarmSatellite: new Action("Sun Swarm Satellite", "space", "swarm_satellite", "spc_sun"),

            // Gas
            GasMission: new Action("Gas Mission", "space", "gas_mission", "spc_gas", {mission: true}),
            GasMining: new Action("Gas Helium-3 Collector", "space", "gas_mining", "spc_gas"),
            GasStorage: new Action("Gas Fuel Depot", "space", "gas_storage", "spc_gas"),
            GasSpaceDock: new SpaceDock(), // has options
            GasSpaceDockProbe: new ModalAction("Gas Space Probe", "starDock", "probes", "", "starDock"),
            GasSpaceDockShipSegment: new ModalAction("Gas Bioseeder Ship Segment", "starDock", "seeder", "", "starDock"),
            GasSpaceDockPrepForLaunch: new ModalAction("Gas Prep Ship", "starDock", "prep_ship", "", "starDock"),
            GasSpaceDockLaunch: new ModalAction("Gas Launch Ship", "starDock", "launch_ship", "", "starDock"),

            // Gas moon
            GasMoonMission: new Action("Gas Moon Mission", "space", "gas_moon_mission", "spc_gas_moon", {mission: true}),
            GasMoonOutpost: new Action("Gas Moon Mining Outpost", "space", "outpost", "spc_gas_moon"),
            GasMoonDrone: new Action("Gas Moon Mining Drone", "space", "drone", "spc_gas_moon"),
            GasMoonOilExtractor: new Action("Gas Moon Oil Extractor", "space", "oil_extractor", "spc_gas_moon"),

            // Belt
            BeltMission: new Action("Belt Mission", "space", "belt_mission", "spc_belt", {mission: true}),
            BeltSpaceStation: new Action("Belt Space Station", "space", "space_station", "spc_belt"),
            BeltEleriumShip: new Action("Belt Elerium Mining Ship", "space", "elerium_ship", "spc_belt"),
            BeltIridiumShip: new Action("Belt Iridium Mining Ship", "space", "iridium_ship", "spc_belt"),
            BeltIronShip: new Action("Belt Iron Mining Ship", "space", "iron_ship", "spc_belt"),

            // Dwarf
            DwarfMission: new Action("Dwarf Mission", "space", "dwarf_mission", "spc_dwarf", {mission: true}),
            DwarfEleriumContainer: new Action("Dwarf Elerium Storage", "space", "elerium_contain", "spc_dwarf"),
            DwarfEleriumReactor: new Action("Dwarf Elerium Reactor", "space", "e_reactor", "spc_dwarf"),
            DwarfWorldCollider: new Action("Dwarf World Collider", "space", "world_collider", "spc_dwarf"),
            DwarfWorldController: new Action("Dwarf WSC Control", "space", "world_controller", "spc_dwarf"),

            AlphaMission: new Action("Alpha Centauri Mission", "interstellar", "alpha_mission", "int_alpha", {mission: true}),
            AlphaStarport: new Action("Alpha Starport", "interstellar", "starport", "int_alpha"),
            AlphaHabitat: new Action("Alpha Habitat", "interstellar", "habitat", "int_alpha", {housing: true}),
            AlphaMiningDroid: new MiningDroid(), // has options
            AlphaProcessing: new Action("Alpha Processing", "interstellar", "processing", "int_alpha"),
            AlphaFusion: new Action("Alpha Fusion", "interstellar", "fusion", "int_alpha"),
            AlphaLaboratory: new Action("Alpha Laboratory", "interstellar", "laboratory", "int_alpha", {knowledge: true}),
            AlphaExchange: new Action("Alpha Exchange", "interstellar", "exchange", "int_alpha"),
            AlphaFactory: new GraphenePlant(), // has options
            AlphaWarehouse: new Action("Alpha Warehouse", "interstellar", "warehouse", "int_alpha"),
            AlphaMegaFactory: new Action("Alpha Mega Factory", "interstellar", "int_factory", "int_alpha"),
            AlphaLuxuryCondo: new Action("Alpha Luxury Condo", "interstellar", "luxury_condo", "int_alpha", {housing: true}),

            ProximaMission: new Action("Proxima Mission", "interstellar", "proxima_mission", "int_proxima", {mission: true}),
            ProximaTransferStation: new Action("Proxima Transfer Station", "interstellar", "xfer_station", "int_proxima"),
            ProximaCargoYard: new Action("Proxima Cargo Yard", "interstellar", "cargo_yard", "int_proxima"),
            ProximaCruiser: new Action("Proxima Cruiser", "interstellar", "cruiser", "int_proxima", {garrison: true}),
            ProximaDyson: new Action("Proxima Dyson", "interstellar", "dyson", "int_proxima"),
            ProximaDysonSphere: new Action("Proxima Dyson Sphere", "interstellar", "dyson_sphere", "int_proxima"),
            ProximaOrichalcumSphere: new Action("Proxima Orichalcum Sphere", "interstellar", "orichalcum_sphere", "int_proxima"),

            NebulaMission: new Action("Nebula Mission", "interstellar", "nebula_mission", "int_nebula", {mission: true}),
            NebulaNexus: new Action("Nebula Nexus", "interstellar", "nexus", "int_nebula"),
            NebulaHarvestor: new Action("Nebula Harvester", "interstellar", "harvester", "int_nebula"),
            NebulaEleriumProspector: new Action("Nebula Elerium Prospector", "interstellar", "elerium_prospector", "int_nebula"),

            NeutronMission: new Action("Neutron Mission", "interstellar", "neutron_mission", "int_neutron", {mission: true}),
            NeutronMiner: new Action("Neutron Miner", "interstellar", "neutron_miner", "int_neutron"),
            NeutronCitadel: new Action("Neutron Citadel Station", "interstellar", "citadel", "int_neutron"),
            NeutronStellarForge: new Action("Neutron Stellar Forge", "interstellar", "stellar_forge", "int_neutron"),

            Blackhole: new Action("Blackhole Mission", "interstellar", "blackhole_mission", "int_blackhole", {mission: true}),
            BlackholeFarReach: new Action("Blackhole Far Reach", "interstellar", "far_reach", "int_blackhole", {knowledge: true}),
            BlackholeStellarEngine: new Action("Blackhole Stellar Engine", "interstellar", "stellar_engine", "int_blackhole"),
            BlackholeMassEjector: new Action("Blackhole Mass Ejector", "interstellar", "mass_ejector", "int_blackhole"),

            BlackholeJumpShip: new Action("Blackhole Jump Ship", "interstellar", "jump_ship", "int_blackhole"),
            BlackholeWormholeMission: new Action("Blackhole Wormhole Mission", "interstellar", "wormhole_mission", "int_blackhole"),
            BlackholeStargate: new Action("Blackhole Stargate", "interstellar", "stargate", "int_blackhole"),
            BlackholeCompletedStargate: new Action("Blackhole Completed Stargate", "interstellar", "s_gate", "int_blackhole"),

            SiriusMission: new Action("Sirius Mission", "interstellar", "sirius_mission", "int_sirius", {mission: true}),
            SiriusAnalysis: new Action("Sirius B Analysis", "interstellar", "sirius_b", "int_sirius"),
            SiriusSpaceElevator: new Action("Sirius Space Elevator", "interstellar", "space_elevator", "int_sirius"),
            SiriusGravityDome: new Action("Sirius Gravity Dome", "interstellar", "gravity_dome", "int_sirius"),
            SiriusAscensionMachine: new Action("Sirius Ascension Machine", "interstellar", "ascension_machine", "int_sirius"),
            SiriusAscensionTrigger: new Action("Sirius Ascension Trigger", "interstellar", "ascension_trigger", "int_sirius"),
            SiriusAscend: new Action("Sirius Ascend", "interstellar", "ascend", "int_sirius"),
            SiriusThermalCollector: new Action("Sirius ThermalCollector", "interstellar", "thermal_collector", "int_sirius"),

            // GatewayMission: new Action("Gateway Mission", "galaxy", "gateway_mission", "gxy_gateway"),
            // GatewayStarbase: new Action("Gateway Starbase", "galaxy", "starbase", "gxy_gateway"),
            // GatewayShipDock: new Action("Gateway Ship Dock", "galaxy", "ship_dock", "gxy_gateway"),

            // StargateStation: new Action("Stargate Station", "galaxy", "gateway_station", "gxy_stargate"),
            // StargateTelemetryBeacon: new Action("Stargate Telemetry Beacon", "galaxy", "telemetry_beacon", "gxy_stargate"),
            // StargateDepot: new Action("Stargate Depot", "galaxy", "gateway_depot", "gxy_stargate"),
            // StargateDefensePlatform: new Action("Stargate Defense Platform", "galaxy", "defense_platform", "gxy_stargate"),

            // GorddonMission: new Action("Gorddon Mission", "galaxy", "demaus_mission", "gxy_gorddon"),
            // GorddonEmbassy: new Action("Gorddon Embassy", "galaxy", "embassy", "gxy_gorddon"),
            // GorddonDormitory: new Action("Gorddon Dormitory", "galaxy", "dormitory", "gxy_gorddon"),
            // GorddonSymposium: new Action("Gorddon Symposium", "galaxy", "symposium", "gxy_gorddon"),
            // GorddonFreighter: new Action("Gorddon Freighter", "galaxy", "freighter", "gxy_gorddon"),

            // Alien1Consulate: new Action("Alien 1 Consulate", "galaxy", "consulate", "gxy_alien1"),
            Alien1Resort: new Action("Alien 1 Resort", "galaxy", "resort", "gxy_alien1"),
            // Alien1VitreloyPlant: new Action("Alien 1 Vitreloy Plant", "galaxy", "vitreloy_plant", "gxy_alien1"),
            // Alien1SuperFreighter: new Action("Alien 1 Super Freighter", "galaxy", "super_freighter", "gxy_alien1"),

            // Alien2Mission: new Action("Alien 2 Mission", "galaxy", "alien2_mission", "gxy_alien2"),
            // Alien2Foothold: new Action("Alien 2 Foothold", "galaxy", "foothold", "gxy_alien2"),
            // Alien2ArmedMiner: new Action("Alien 2 Armed Miner", "galaxy", "armed_miner", "gxy_alien2"),
            // Alien2OreProcessor: new Action("Alien 2 Ore Processor", "galaxy", "ore_processor", "gxy_alien2"),
            // Alien2Scavenger: new Action("Alien 2 Scavenger", "galaxy", "scavenger", "gxy_alien2"),

            // ChthonianMission: new Action("Chthonian Mission", "galaxy", "chthonian_mission", "gxy_chthonian"),
            // ChthonianMineLayer: new Action("Chthonian Mine Layer", "galaxy", "minelayer", "gxy_chthonian"),
            // ChthonianExcavator: new Action("Chthonian Excavator", "galaxy", "excavator", "gxy_chthonian"),
            // ChthonianRaider: new Action("Chthonian Raider", "galaxy", "raider", "gxy_chthonian"),

            PortalTurret: new Action("Portal Laser Turret", "portal", "turret", "prtl_fortress"),
            PortalCarport: new Action("Portal Surveyor Carport", "portal", "carport", "prtl_fortress"),
            PortalWarDroid: new Action("Portal War Droid", "portal", "war_droid", "prtl_fortress"),
            PortalRepairDroid: new Action("Portal Repair Droid", "portal", "repair_droid", "prtl_fortress"),

            PortalWarDrone: new Action("Portal Predator Drone", "portal", "war_drone", "prtl_badlands"),
            PortalSensorDrone: new Action("Portal Sensor Drone", "portal", "sensor_drone", "prtl_badlands"),
            PortalAttractor: new Action("Portal Attractor Beacon", "portal", "attractor", "prtl_badlands"),

            PortalPitMission: new Action("Portal Pit Mission", "portal", "pit_mission", "prtl_pit", {mission: true}),
            PortalAssaultForge: new Action("Portal AssaultForge", "portal", "assault_forge", "prtl_pit"),
            PortalSoulForge: new Action("Portal Soul Forge", "portal", "soul_forge", "prtl_pit"),
            PortalGunEmplacement: new Action("Portal Gun Emplacement", "portal", "gun_emplacement", "prtl_pit"),
            PortalSoulAttractor: new Action("Portal Soul Attractor", "portal", "soul_attractor", "prtl_pit"),
        },

        projects: {
            SuperCollider: new Project("Supercollider", "lhc"),
            StockExchange: new Project("Stock Exchange", "stock_exchange"),
            Monument: new Project("Monument", "monument"),
            Railway: new Project("Railway", "railway"),
            LaunchFacility: new Project("Launch Facility", "launch_facility"),
        },

        //global: null,
    };

    function initialiseState() {
        // Construct craftable resource list
        state.craftableResourceList.push(resources.Plywood);
        resources.Plywood.resourceRequirements.push(new ResourceRequirement(resources.Lumber, 100));
        state.craftableResourceList.push(resources.Brick);
        resources.Brick.resourceRequirements.push(new ResourceRequirement(resources.Cement, 40));
        state.craftableResourceList.push(resources.Wrought_Iron);
        resources.Wrought_Iron.resourceRequirements.push(new ResourceRequirement(resources.Iron, 80));
        state.craftableResourceList.push(resources.Sheet_Metal);
        resources.Sheet_Metal.resourceRequirements.push(new ResourceRequirement(resources.Aluminium, 120));
        state.craftableResourceList.push(resources.Mythril);
        resources.Mythril.resourceRequirements.push(new ResourceRequirement(resources.Iridium, 100));
        resources.Mythril.resourceRequirements.push(new ResourceRequirement(resources.Alloy, 250));
        state.craftableResourceList.push(resources.Aerogel);
        resources.Aerogel.resourceRequirements.push(new ResourceRequirement(resources.Graphene, 2500));
        resources.Aerogel.resourceRequirements.push(new ResourceRequirement(resources.Infernite, 50));
        state.craftableResourceList.push(resources.Nanoweave);
        resources.Nanoweave.resourceRequirements.push(new ResourceRequirement(resources.Nano_Tube, 1000));
        resources.Nanoweave.resourceRequirements.push(new ResourceRequirement(resources.Vitreloy, 40));
        state.craftableResourceList.push(resources.Scarletite);
        resources.Scarletite.resourceRequirements.push(new ResourceRequirement(resources.Iron, 250000));
        resources.Scarletite.resourceRequirements.push(new ResourceRequirement(resources.Adamantite, 7500));
        resources.Scarletite.resourceRequirements.push(new ResourceRequirement(resources.Orichalcum, 500));

        // Lets set our crate / container resource requirements
        resources.Crates.resourceRequirements.push(new ResourceRequirement(resources.Plywood, 10));
        resources.Containers.resourceRequirements.push(new ResourceRequirement(resources.Steel, 125));

        state.jobManager.addCraftingJob(state.jobs.Plywood);
        state.jobManager.addCraftingJob(state.jobs.Brick);
        state.jobManager.addCraftingJob(state.jobs.WroughtIron);
        state.jobManager.addCraftingJob(state.jobs.SheetMetal);
        state.jobManager.addCraftingJob(state.jobs.Mythril);
        state.jobManager.addCraftingJob(state.jobs.Aerogel);
        state.jobManager.addCraftingJob(state.jobs.Nanoweave);
        state.jobManager.addCraftingJob(state.jobs.Scarletite);

        resetJobState();

        // Construct city builds list
        //state.cityBuildings.SacrificialAltar.gameMax = 1; // Although it is technically limited to single altar, we don't care about that, as we're going to click it to make sacrifices
        state.spaceBuildings.GasSpaceDock.gameMax = 1;
        state.spaceBuildings.DwarfWorldController.gameMax = 1;
        state.spaceBuildings.GasSpaceDockShipSegment.gameMax = 100;
        state.spaceBuildings.ProximaDyson.gameMax = 100;
        state.spaceBuildings.BlackholeStellarEngine.gameMax = 100;
        state.spaceBuildings.DwarfWorldCollider.gameMax = 1859;

        state.spaceBuildings.ProximaDysonSphere.gameMax = 100;
        state.spaceBuildings.ProximaOrichalcumSphere.gameMax = 100;
        state.spaceBuildings.BlackholeStargate.gameMax = 200;
        state.spaceBuildings.BlackholeCompletedStargate.gameMax = 1;
        state.spaceBuildings.SiriusSpaceElevator.gameMax = 100;
        state.spaceBuildings.SiriusGravityDome.gameMax = 100;
        state.spaceBuildings.SiriusAscensionMachine.gameMax = 100;
        state.spaceBuildings.SiriusAscensionTrigger.gameMax = 1;
        state.spaceBuildings.SiriusAscend.gameMax = 1;
        state.spaceBuildings.PortalSoulForge.gameMax = 1;

        state.cityBuildings.Smelter.addSmeltingConsumption(SmelterSmeltingTypes.Steel, resources.Coal, 0.25, 1.25);
        state.cityBuildings.Smelter.addSmeltingConsumption(SmelterSmeltingTypes.Steel, resources.Iron, 2, 6);
        if (game.global.race.universe == "magic"){
            state.cityBuildings.CoalPower.addResourceConsumption(resources.Mana, 0.05);
        } else {
            state.cityBuildings.CoalPower.addResourceConsumption(resources.Coal, 0.35);
        }
        state.cityBuildings.OilPower.addResourceConsumption(resources.Oil, 0.65);
        state.cityBuildings.FissionPower.addResourceConsumption(resources.Uranium, 0.1);
        state.cityBuildings.TouristCenter.addResourceConsumption(resources.Food, 50);

        // Construct space buildings list
        state.spaceBuildings.SpaceNavBeacon.addResourceConsumption(resources.Moon_Support, -1);
        state.spaceBuildings.MoonBase.addResourceConsumption(resources.Moon_Support, -2);
        state.spaceBuildings.MoonBase.addResourceConsumption(resources.Oil, 2);
        state.spaceBuildings.MoonIridiumMine.addResourceConsumption(resources.Moon_Support, 1);
        state.spaceBuildings.MoonHeliumMine.addResourceConsumption(resources.Moon_Support, 1);
        state.spaceBuildings.MoonObservatory.addResourceConsumption(resources.Moon_Support, 1);
        state.spaceBuildings.RedSpaceport.addResourceConsumption(resources.Red_Support, -3);
        state.spaceBuildings.RedSpaceport.addResourceConsumption(resources.Helium_3, 1.25);
        state.spaceBuildings.RedSpaceport.addResourceConsumption(resources.Food, 25);
        state.spaceBuildings.RedTower.addResourceConsumption(resources.Red_Support, -1);
        state.spaceBuildings.RedLivingQuarters.addResourceConsumption(resources.Red_Support, 1);
        state.spaceBuildings.RedMine.addResourceConsumption(resources.Red_Support, 1);
        state.spaceBuildings.RedFabrication.addResourceConsumption(resources.Red_Support, 1);
        state.spaceBuildings.RedFactory.addResourceConsumption(resources.Helium_3, 1);
        state.spaceBuildings.RedBiodome.addResourceConsumption(resources.Red_Support, 1);
        state.spaceBuildings.RedExoticLab.addResourceConsumption(resources.Red_Support, 1);
        state.spaceBuildings.RedSpaceBarracks.addResourceConsumption(resources.Oil, 2);
        state.spaceBuildings.RedSpaceBarracks.addResourceConsumption(resources.Food, 10);
        state.spaceBuildings.RedVrCenter.addResourceConsumption(resources.Red_Support, 1);
        state.spaceBuildings.HellGeothermal.addResourceConsumption(resources.Helium_3, 0.5);
        state.spaceBuildings.SunSwarmControl.addResourceConsumption(resources.Sun_Support, -4);
        state.spaceBuildings.SunSwarmSatellite.addResourceConsumption(resources.Sun_Support, 1);
        state.spaceBuildings.GasMoonOutpost.addResourceConsumption(resources.Oil, 2);
        state.spaceBuildings.BeltSpaceStation.addResourceConsumption(resources.Belt_Support, -3);
        state.spaceBuildings.BeltSpaceStation.addResourceConsumption(resources.Food, 10);
        state.spaceBuildings.BeltSpaceStation.addResourceConsumption(resources.Helium_3, 2.5);
        state.spaceBuildings.BeltEleriumShip.addResourceConsumption(resources.Belt_Support, 2);
        state.spaceBuildings.BeltIridiumShip.addResourceConsumption(resources.Belt_Support, 1);
        state.spaceBuildings.BeltIronShip.addResourceConsumption(resources.Belt_Support, 1);
        state.spaceBuildings.DwarfEleriumReactor.addResourceConsumption(resources.Elerium, 0.05);

        state.spaceBuildings.AlphaStarport.addResourceConsumption(resources.Alpha_Support, -5);
        state.spaceBuildings.AlphaStarport.addResourceConsumption(resources.Food, 100);
        state.spaceBuildings.AlphaStarport.addResourceConsumption(resources.Helium_3, 5);
        state.spaceBuildings.AlphaHabitat.addResourceConsumption(resources.Alpha_Support, -1);
        state.spaceBuildings.AlphaMiningDroid.addResourceConsumption(resources.Alpha_Support, 1);
        state.spaceBuildings.AlphaProcessing.addResourceConsumption(resources.Alpha_Support, 1);
        state.spaceBuildings.AlphaFusion.addResourceConsumption(resources.Alpha_Support, 1);
        state.spaceBuildings.AlphaFusion.addResourceConsumption(resources.Deuterium, 1.25);
        state.spaceBuildings.AlphaLaboratory.addResourceConsumption(resources.Alpha_Support, 1);
        state.spaceBuildings.AlphaExchange.addResourceConsumption(resources.Alpha_Support, 1);
        state.spaceBuildings.AlphaFactory.addResourceConsumption(resources.Alpha_Support, 1);
        state.spaceBuildings.AlphaFactory.addGrapheneConsumption(resources.Lumber, 350, 100);
        state.spaceBuildings.AlphaFactory.addGrapheneConsumption(resources.Coal, 25, 10);
        state.spaceBuildings.AlphaFactory.addGrapheneConsumption(resources.Oil, 15, 10);

        state.spaceBuildings.ProximaTransferStation.addResourceConsumption(resources.Alpha_Support, -1);
        state.spaceBuildings.ProximaTransferStation.addResourceConsumption(resources.Uranium, 0.28);
        state.spaceBuildings.ProximaCruiser.addResourceConsumption(resources.Helium_3, 6);

        state.spaceBuildings.NebulaNexus.addResourceConsumption(resources.Nebula_Support, -2);
        state.spaceBuildings.NebulaHarvestor.addResourceConsumption(resources.Nebula_Support, 1);

        state.spaceBuildings.NebulaEleriumProspector.addResourceConsumption(resources.Nebula_Support, 1);

        state.spaceBuildings.NeutronMiner.addResourceConsumption(resources.Helium_3, 3);

        state.spaceBuildings.AlphaMegaFactory.addResourceConsumption(resources.Deuterium, 5);


        // These are buildings which are specified as powered in the actions definition game code but aren't actually powered in the main.js powered calculations
        ////////////////////
        state.cityBuildings.TouristCenter.overridePowered = 0;
        state.spaceBuildings.MoonIridiumMine.overridePowered = 0;
        state.spaceBuildings.MoonHeliumMine.overridePowered = 0;
        state.spaceBuildings.MoonObservatory.overridePowered = 0;
        state.spaceBuildings.RedLivingQuarters.overridePowered = 0;
        state.spaceBuildings.RedMine.overridePowered = 0;
        state.spaceBuildings.RedFabrication.overridePowered = 0;
        state.spaceBuildings.RedBiodome.overridePowered = 0;
        state.spaceBuildings.RedExoticLab.overridePowered = 0;
        state.spaceBuildings.RedSpaceBarracks.overridePowered = 0;
        state.spaceBuildings.RedVrCenter.overridePowered = 0;
        state.spaceBuildings.BeltEleriumShip.overridePowered = 0;
        state.spaceBuildings.BeltIridiumShip.overridePowered = 0;
        state.spaceBuildings.BeltIronShip.overridePowered = 0;
        state.spaceBuildings.AlphaMiningDroid.overridePowered = 0;
        state.spaceBuildings.AlphaProcessing.overridePowered = 0;
        state.spaceBuildings.AlphaLaboratory.overridePowered = 0;
        state.spaceBuildings.AlphaExchange.overridePowered = 0;
        state.spaceBuildings.AlphaFactory.overridePowered = 0;
        state.spaceBuildings.ProximaCruiser.overridePowered = 0;
        state.spaceBuildings.NebulaHarvestor.overridePowered = 0;
        state.spaceBuildings.NebulaEleriumProspector.overridePowered = 0;
        state.spaceBuildings.SunSwarmSatellite.overridePowered = -0.35;
        state.spaceBuildings.ProximaDyson.overridePowered = -1.25;
        ////////////////////

        // We aren't getting these ones yet...
        state.spaceBuildings.GasSpaceDockShipSegment.resourceRequirements.push(new ResourceRequirement(resources.Money, 100000));
        state.spaceBuildings.GasSpaceDockShipSegment.resourceRequirements.push(new ResourceRequirement(resources.Steel, 25000));
        state.spaceBuildings.GasSpaceDockShipSegment.resourceRequirements.push(new ResourceRequirement(resources.Neutronium, 240));
        state.spaceBuildings.GasSpaceDockShipSegment.resourceRequirements.push(new ResourceRequirement(resources.Elerium, 10));
        state.spaceBuildings.GasSpaceDockShipSegment.resourceRequirements.push(new ResourceRequirement(resources.Nano_Tube, 12000));

        state.evolutionChallengeList.push(state.evolutions.Bunker);
        state.evolutionChallengeList.push(state.evolutions.Plasmid);
        state.evolutionChallengeList.push(state.evolutions.Trade);
        state.evolutionChallengeList.push(state.evolutions.Craft);
        state.evolutionChallengeList.push(state.evolutions.Crispr);
        state.evolutionChallengeList.push(state.evolutions.Mastery);
        state.evolutionChallengeList.push(state.evolutions.Joyless);
        state.evolutionChallengeList.push(state.evolutions.Decay);
        state.evolutionChallengeList.push(state.evolutions.Junker);
        state.evolutionChallengeList.push(state.evolutions.Steelen);
        state.evolutionChallengeList.push(state.evolutions.EmField);
        state.evolutionChallengeList.push(state.evolutions.Cataclysm);

        resetMarketState();
        resetStorageState();
        resetProjectState();
        resetWarState();
        resetProductionState();
        resetBuildingState();
        resetMinorTraitState();
    }

    function initialiseRaces() {
        let e = state.evolutions;

        let bilateralSymmetry = [e.BilateralSymmetry, e.Multicellular, e.Phagocytosis, e.SexualReproduction];

        let aquatic = [e.Sentience, e.Aquatic].concat(bilateralSymmetry);
        races.sharkin.evolutionTree = [e.Sharkin].concat(aquatic);
        races.octigoran.evolutionTree = [e.Octigoran].concat(aquatic);
        let raceGroup = [ races.sharkin, races.octigoran ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'aquatic') {
            races.custom.evolutionTree = [e.Custom].concat(aquatic)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let arthropods = [e.Sentience, e.Arthropods].concat(bilateralSymmetry);
        races.antid.evolutionTree = [e.Antid].concat(arthropods);
        races.scorpid.evolutionTree = [e.Scorpid].concat(arthropods);
        races.mantis.evolutionTree = [e.Mantis].concat(arthropods);
        raceGroup = [ races.antid, races.scorpid, races.mantis ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'insectoid') {
            races.custom.evolutionTree = [e.Custom].concat(arthropods)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let humanoid = [e.Sentience, e.Humanoid, e.Mammals].concat(bilateralSymmetry);
        races.human.evolutionTree = [e.Human].concat(humanoid);
        races.orc.evolutionTree = [e.Orc].concat(humanoid);
        races.elven.evolutionTree = [e.Elven].concat(humanoid);
        races.junker.evolutionTree = [e.Valdi, e.Bunker].concat(humanoid); // requires bunker gene
        raceGroup = [ races.human, races.orc, races.elven, races.junker ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'humanoid') {
            races.custom.evolutionTree = [e.Custom].concat(humanoid)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let gigantism = [e.Sentience, e.Gigantism, e.Mammals].concat(bilateralSymmetry);
        races.troll.evolutionTree = [e.Troll].concat(gigantism);
        races.ogre.evolutionTree = [e.Ogre].concat(gigantism);
        races.cyclops.evolutionTree = [e.Cyclops].concat(gigantism);
        raceGroup = [ races.troll, races.ogre, races.cyclops ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'giant') {
            races.custom.evolutionTree = [e.Custom].concat(gigantism)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let dwarfism = [e.Sentience, e.Dwarfism, e.Mammals].concat(bilateralSymmetry);
        races.kobold.evolutionTree = [e.Kobold].concat(dwarfism);
        races.goblin.evolutionTree = [e.Goblin].concat(dwarfism);
        races.gnome.evolutionTree = [e.Gnome].concat(dwarfism);
        raceGroup = [ races.kobold, races.goblin, races.gnome ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'small') {
            races.custom.evolutionTree = [e.Custom].concat(dwarfism)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let animalism = [e.Sentience, e.Animalism, e.Mammals].concat(bilateralSymmetry);
        races.cath.evolutionTree = [e.Cath].concat(animalism);
        races.wolven.evolutionTree = [e.Wolven].concat(animalism);
        races.centaur.evolutionTree = [e.Centaur].concat(animalism);
        raceGroup = [ races.cath, races.wolven, races.centaur ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'animal') {
            races.custom.evolutionTree = [e.Custom].concat(animalism)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let demonic = [e.Sentience, e.Demonic, e.Mammals].concat(bilateralSymmetry);
        races.balorg.evolutionTree = [e.Balorg].concat(demonic);
        races.imp.evolutionTree = [e.Imp].concat(demonic);
        raceGroup = [ races.balorg, races.imp ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'demonic') {
            races.custom.evolutionTree = [e.Custom].concat(demonic)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let celestial = [e.Sentience, e.Celestial, e.Mammals].concat(bilateralSymmetry);
        races.seraph.evolutionTree = [e.Seraph].concat(celestial);
        races.unicorn.evolutionTree = [e.Unicorn].concat(celestial);
        raceGroup = [ races.seraph, races.unicorn ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'angelic') {
            races.custom.evolutionTree = [e.Custom].concat(celestial)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let fey = [e.Sentience, e.Fey, e.Mammals].concat(bilateralSymmetry);
        races.dryad.evolutionTree = [e.Dryad].concat(fey);
        races.satyr.evolutionTree = [e.Satyr].concat(fey);
        raceGroup = [ races.dryad, races.satyr ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'fey') {
            races.custom.evolutionTree = [e.Custom].concat(fey)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let heat = [e.Sentience, e.Heat, e.Mammals].concat(bilateralSymmetry);
        races.phoenix.evolutionTree = [e.Phoenix].concat(heat);
        races.salamander.evolutionTree = [e.Salamander].concat(heat);
        raceGroup = [ races.phoenix, races.salamander ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'heat') {
            races.custom.evolutionTree = [e.Custom].concat(heat)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let polar = [e.Sentience, e.Polar, e.Mammals].concat(bilateralSymmetry);
        races.yeti.evolutionTree = [e.Yeti].concat(polar);
        races.wendigo.evolutionTree = [e.Wendigo].concat(polar);
        raceGroup = [ races.yeti, races.wendigo ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'polar') {
            races.custom.evolutionTree = [e.Custom].concat(polar)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let sand = [e.Sentience, e.Sand, e.Mammals].concat(bilateralSymmetry);
        races.tuskin.evolutionTree = [e.Tuskin].concat(sand);
        races.kamel.evolutionTree = [e.Kamel].concat(sand);
        raceGroup = [ races.tuskin, races.kamel ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'sand') {
            races.custom.evolutionTree = [e.Custom].concat(sand)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let endothermic = [e.Sentience, e.Endothermic, e.Eggshell].concat(bilateralSymmetry);
        races.arraak.evolutionTree = [e.Arraak].concat(endothermic);
        races.pterodacti.evolutionTree = [e.Pterodacti].concat(endothermic);
        races.dracnid.evolutionTree = [e.Dracnid].concat(endothermic);
        raceGroup = [ races.arraak, races.pterodacti, races.dracnid ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'avian') {
            races.custom.evolutionTree = [e.Custom].concat(endothermic)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let ectothermic = [e.Sentience, e.Ectothermic, e.Eggshell].concat(bilateralSymmetry);
        races.tortoisan.evolutionTree = [e.Tortoisan].concat(ectothermic);
        races.gecko.evolutionTree = [e.Gecko].concat(ectothermic);
        races.slitheryn.evolutionTree = [e.Slitheryn].concat(ectothermic);
        raceGroup = [ races.tortoisan, races.gecko, races.slitheryn ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'reptilian') {
            races.custom.evolutionTree = [e.Custom].concat(ectothermic)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let chloroplasts = [e.Sentience, e.Bryophyte, e.Poikilohydric, e.Multicellular, e.Chloroplasts, e.SexualReproduction];
        races.entish.evolutionTree = [e.Entish].concat(chloroplasts);
        races.cacti.evolutionTree = [e.Cacti].concat(chloroplasts);
        races.pinguicula.evolutionTree = [e.Pinguicula].concat(chloroplasts);
        raceGroup = [ races.entish, races.cacti, races.pinguicula ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'plant') {
            races.custom.evolutionTree = [e.Custom].concat(chloroplasts)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let chitin = [e.Sentience, e.Bryophyte, e.Spores, e.Multicellular, e.Chitin, e.SexualReproduction];
        races.sporgar.evolutionTree = [e.Sporgar].concat(chitin);
        races.shroomi.evolutionTree = [e.Shroomi].concat(chitin);
        races.moldling.evolutionTree = [e.Moldling].concat(chitin);
        raceGroup = [ races.sporgar, races.shroomi, races.moldling ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'fungi') {
            races.custom.evolutionTree = [e.Custom].concat(chitin)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);
    }

    function resetWarSettings() {
        settings.foreignAttackLivingSoldiersPercent = 100;
        settings.foreignAttackHealthySoldiersPercent = 100;
        settings.foreignHireMercMoneyStoragePercent = 90;
        settings.foreignHireMercCostLowerThan = 50000;

        settings.foreignPacifist = false;
        settings.foreignUnification = true;
        settings.foreignForceSabotage = true;
        settings.foreignOccupyLast = true;
        settings.foreignTrainSpy = true;
        settings.foreignSpyMax = 2;
        settings.foreignPowerRequired = 75;
        settings.foreignPolicyInferior = "Annex";
        settings.foreignPolicySuperior = "Sabotage";
    }

    function resetWarState() {
        state.warManager.clearCampaignList();

        state.warManager.addToCampaignList("Ambush", 10, 20);
        state.warManager.addToCampaignList("Raid", 50, 100);
        state.warManager.addToCampaignList("Pillage", 100, 180);
        state.warManager.addToCampaignList("Assault", 200, 360);
        state.warManager.addToCampaignList("Siege", 500, 800);
    }

    function resetHellSettings() {
        settings.hellTurnOffLogMessages = true;
        settings.hellHandlePatrolCount = true;
        settings.hellHomeGarrison = 20;
        settings.hellMinSoldiers = 20;
        settings.hellMinSoldiersPercent = 90;

        settings.hellTargetFortressDamage = 100;
        settings.hellLowWallsMulti = 3;

        settings.hellHandlePatrolSize = true;
        settings.hellPatrolMinRating = 80;
        settings.hellPatrolThreatPercent = 8;
        settings.hellPatrolDroneMod = 5;
        settings.hellPatrolDroidMod = 5;
        settings.hellPatrolBootcampMod = 0;
        settings.hellBolsterPatrolPercentTop = 80;
        settings.hellBolsterPatrolPercentBottom = 40;
        settings.hellBolsterPatrolRating = 300;

        settings.hellHandleAttractors = true;
        settings.hellAttractorTopThreat = 3000;
        settings.hellAttractorBottomThreat = 1300;
    }

    function resetGeneralSettings() {
        settings.genesAssembleGeneAlways = false;
    }

    function resetPrestigeSettings() {
        settings.prestigeType = "none";

        settings.autoSpace = false;
        settings.prestigeBioseedConstruct = false;
        settings.prestigeBioseedProbes = 3;

        settings.prestigeWhiteholeMinMass = 8;
        settings.prestigeWhiteholeStabiliseMass = true;
        settings.prestigeWhiteholeEjectEnabled = true;
        settings.prestigeWhiteholeDecayRate = 0.2;
        settings.prestigeWhiteholeEjectAllCount = 5;
    }

    function resetGovernmentSettings() {
        settings.generalMinimumTaxRate = 0;
        settings.generalMinimumMorale = 105;
        settings.generalMaximumMorale = 500;
        settings.govManage = false;
        settings.govInterim = governmentTypes.democracy.id;
        settings.govFinal = governmentTypes.technocracy.id;
        settings.govSpace = governmentTypes.corpocracy.id;
    }

    function resetEvolutionSettings() {
        settings.userUniverseTargetName = "none";
        settings.userPlanetTargetName = "none";
        settings.userEvolutionTarget = "auto";
        settings.evolutionIgnore = {};
        settings.evolutionQueue = [];
        settings.evolutionQueueEnabled = false;
        settings.evolutionBackup = false;
        settings.challenge_plasmid = false;
        settings.challenge_trade = false;
        settings.challenge_craft = false;
        settings.challenge_crispr = false;
        settings.challenge_mastery = false;
        settings.challenge_joyless = false;
        settings.challenge_decay = false;
        settings.challenge_junker = false;
        settings.challenge_steelen = false;
        settings.challenge_emfield = false;
        settings.challenge_cataclysm = false;
    }

    function resetResearchSettings() {
        settings.userResearchTheology_1 = "auto";
        settings.userResearchTheology_2 = "auto";
    }

    function resetMarketState() {
        state.marketManager.clearPriorityList();

        state.marketManager.addResourceToPriorityList(resources.Helium_3);
        state.marketManager.addResourceToPriorityList(resources.Iridium);
        state.marketManager.addResourceToPriorityList(resources.Polymer);
        state.marketManager.addResourceToPriorityList(resources.Alloy);
        state.marketManager.addResourceToPriorityList(resources.Titanium);
        state.marketManager.addResourceToPriorityList(resources.Steel);
        state.marketManager.addResourceToPriorityList(resources.Uranium);
        state.marketManager.addResourceToPriorityList(resources.Oil);
        state.marketManager.addResourceToPriorityList(resources.Coal);
        state.marketManager.addResourceToPriorityList(resources.Cement);
        state.marketManager.addResourceToPriorityList(resources.Aluminium);
        state.marketManager.addResourceToPriorityList(resources.Iron);
        state.marketManager.addResourceToPriorityList(resources.Copper);
        state.marketManager.addResourceToPriorityList(resources.Furs);
        state.marketManager.addResourceToPriorityList(resources.Crystal);
        state.marketManager.addResourceToPriorityList(resources.Stone);
        state.marketManager.addResourceToPriorityList(resources.Lumber);
        state.marketManager.addResourceToPriorityList(resources.Food);

        resources.Food.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 1);
        resources.Lumber.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 1);
        resources.Stone.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 1);
        resources.Crystal.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 1);
        resources.Furs.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 1);
        resources.Copper.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 1);
        resources.Iron.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 1);
        resources.Aluminium.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 1);
        resources.Cement.updateMarketState(false, 0.3, false, 0.9, false, 0, true, 1);
        resources.Coal.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 1);
        resources.Oil.updateMarketState(false, 0.5, false, 0.9, true, 5, true, 1);
        resources.Uranium.updateMarketState(false, 0.5, false, 0.9, true, 2, true, 1);
        resources.Steel.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 1);
        resources.Titanium.updateMarketState(false, 0.8, false, 0.9, true, 50, true, 1);
        resources.Alloy.updateMarketState(false, 0.8, false, 0.9, true, 50, true, 1);
        resources.Polymer.updateMarketState(false, 0.8, false, 0.9, true, 50, true, 1);
        resources.Iridium.updateMarketState(false, 0.8, false, 0.9, true, 50, true, 1);
        resources.Helium_3.updateMarketState(false, 0.8, false, 0.9, true, 50, true, 1);
    }

    function resetMarketSettings() {
        settings.queueRequest = true;
        settings.tradeRouteMinimumMoneyPerSecond = 300;
        settings.tradeRouteMinimumMoneyPercentage = 5;
    }

    function resetStorageState() {
        state.storageManager.clearPriorityList();

        state.storageManager.addResourceToPriorityList(resources.Orichalcum);
        state.storageManager.addResourceToPriorityList(resources.Vitreloy);
        state.storageManager.addResourceToPriorityList(resources.Bolognium);
        state.storageManager.addResourceToPriorityList(resources.Stanene);
        state.storageManager.addResourceToPriorityList(resources.Graphene);
        state.storageManager.addResourceToPriorityList(resources.Adamantite);
        state.storageManager.addResourceToPriorityList(resources.Iridium);
        state.storageManager.addResourceToPriorityList(resources.Polymer);
        state.storageManager.addResourceToPriorityList(resources.Alloy);
        state.storageManager.addResourceToPriorityList(resources.Titanium);
        state.storageManager.addResourceToPriorityList(resources.Steel);
        state.storageManager.addResourceToPriorityList(resources.Coal);
        state.storageManager.addResourceToPriorityList(resources.Cement);
        state.storageManager.addResourceToPriorityList(resources.Aluminium);
        state.storageManager.addResourceToPriorityList(resources.Iron);
        state.storageManager.addResourceToPriorityList(resources.Copper);
        state.storageManager.addResourceToPriorityList(resources.Furs);
        state.storageManager.addResourceToPriorityList(resources.Stone);
        state.storageManager.addResourceToPriorityList(resources.Lumber);
        state.storageManager.addResourceToPriorityList(resources.Food);

        resources.Food.updateStorageState(true, false, -1, -1);
        resources.Lumber.updateStorageState(true, false, -1, -1);
        resources.Stone.updateStorageState(true, false, -1, -1);
        resources.Furs.updateStorageState(true, false, -1, -1);
        resources.Copper.updateStorageState(true, false, -1, -1);
        resources.Iron.updateStorageState(true, false, -1, -1);
        resources.Aluminium.updateStorageState(true, false, -1, -1);
        resources.Cement.updateStorageState(true, false, -1, -1);
        resources.Coal.updateStorageState(true, false, -1, -1);
        resources.Steel.updateStorageState(true, false, -1, -1);
        resources.Titanium.updateStorageState(true, false, -1, -1);
        resources.Alloy.updateStorageState(true, false, -1, -1);
        resources.Polymer.updateStorageState(true, false, -1, -1);
        resources.Iridium.updateStorageState(true, false, -1, -1);
        resources.Adamantite.updateStorageState(true, false, -1, -1);
        resources.Graphene.updateStorageState(true, false, -1, -1);
        resources.Stanene.updateStorageState(true, false, -1, -1);
        resources.Bolognium.updateStorageState(true, false, -1, -1);
        resources.Vitreloy.updateStorageState(true, false, -1, -1);
        resources.Orichalcum.updateStorageState(true, false, -1, -1);
    }

    function resetStorageSettings() {
        settings.storageLimitPreMad = true;
        settings.storageSafeReassign = true;
    }

    function resetMinorTraitState() {
        state.minorTraitManager.clearPriorityList();

        Object.keys(game.traits).forEach(traitName => {
            // All minor traits and the currently two special traits
            if (traitName === "fortify" || traitName === "mastery" || (game.traits[traitName] && game.traits[traitName].type === 'minor')) {
                let trait = new MinorTrait(traitName);
                trait.autoMinorTraitEnabled = true;
                trait.autoMinorTraitWeighting = 1;

                state.minorTraitManager.addMinorTraitToPriorityList(trait);
            }
        });
    }

    function resetMinorTraitSettings() {
        // None currently
    }

    function resetJobSettings() {
        settings.jobSetDefault = true;
        settings.jobLumberWeighting = 50;
        settings.jobQuarryWeighting = 50;
        settings.jobCrystalWeighting = 50;
        settings.jobScavengerWeighting = 50;

        for (let i = 0; i < state.jobManager.priorityList.length; i++){
            state.jobManager.priorityList[i].autoJobEnabled = true;
        }
    }

    function resetJobState() {
        state.jobManager.clearPriorityList();

        state.jobManager.addJobToPriorityList(state.jobs.Farmer);
        state.jobManager.addJobToPriorityList(state.jobs.Lumberjack);
        state.jobManager.addJobToPriorityList(state.jobs.QuarryWorker);
        state.jobManager.addJobToPriorityList(state.jobs.CrystalMiner);
        state.jobManager.addJobToPriorityList(state.jobs.Scavenger);
        state.jobManager.addJobToPriorityList(state.jobs.Entertainer);
        state.jobManager.addJobToPriorityList(state.jobs.Scientist);
        state.jobManager.addJobToPriorityList(state.jobs.Professor);
        state.jobManager.addJobToPriorityList(state.jobs.CementWorker);
        state.jobManager.addJobToPriorityList(state.jobs.Miner);
        state.jobManager.addJobToPriorityList(state.jobs.CoalMiner);
        state.jobManager.addJobToPriorityList(state.jobs.SpaceMiner);
        state.jobManager.addJobToPriorityList(state.jobs.Colonist);
        state.jobManager.addJobToPriorityList(state.jobs.HellSurveyor);
        state.jobManager.addJobToPriorityList(state.jobs.Banker);
        state.jobManager.addJobToPriorityList(state.jobs.Priest);
        state.jobManager.addJobToPriorityList(state.jobs.Plywood);
        state.jobManager.addJobToPriorityList(state.jobs.Brick);
        state.jobManager.addJobToPriorityList(state.jobs.WroughtIron);
        state.jobManager.addJobToPriorityList(state.jobs.SheetMetal);
        state.jobManager.addJobToPriorityList(state.jobs.Mythril);
        state.jobManager.addJobToPriorityList(state.jobs.Aerogel);
        state.jobManager.addJobToPriorityList(state.jobs.Nanoweave);
        state.jobManager.addJobToPriorityList(state.jobs.Scarletite);

        state.jobs.Farmer.breakpointMaxs = [0, 0, 0]; // Farmers are calculated based on food rate of change only, ignoring cap
        state.jobs.Lumberjack.breakpointMaxs = [5, 10, 10]; // Basic jobs are special - remaining workers divided between them
        state.jobs.QuarryWorker.breakpointMaxs = [5, 10, 10]; // Basic jobs are special - remaining workers divided between them
        state.jobs.CrystalMiner.breakpointMaxs = [5, 10, 10]; // Basic jobs are special - remaining workers divided between them
        state.jobs.Scavenger.breakpointMaxs = [0, 0, 10]; // Basic jobs are special - remaining workers divided between them

        state.jobs.Scientist.breakpointMaxs = [3, 6, -1];
        state.jobs.Professor.breakpointMaxs = [6, 10, -1];
        state.jobs.Entertainer.breakpointMaxs = [2, 5, -1];
        state.jobs.CementWorker.breakpointMaxs = [4, 8, -1]; // Cement works are based on cap and stone rate of change
        state.jobs.Miner.breakpointMaxs = [3, 5, -1];
        state.jobs.CoalMiner.breakpointMaxs = [2, 4, -1];
        state.jobs.Banker.breakpointMaxs = [3, 5, -1];
        state.jobs.Colonist.breakpointMaxs = [0, 0, -1];
        state.jobs.SpaceMiner.breakpointMaxs = [0, 0, -1];
        state.jobs.HellSurveyor.breakpointMaxs = [0, 0, -1];
        state.jobs.Priest.breakpointMaxs = [0, 0, 0];
    }

    function resetWeightingSettings() {
        settings.buildingWeightingNew = 3;
        settings.buildingWeightingUselessPowerPlant = 0;
        settings.buildingWeightingNeedfulPowerPlant = 3;
        settings.buildingWeightingUnderpowered = 0.8;
        settings.buildingWeightingUselessKnowledge = 0.1;
        settings.buildingWeightingNeedfulKnowledge = 5;
        settings.buildingWeightingUnusedEjectors = 0.1;
        settings.buildingWeightingMADUseless = 0;
        settings.buildingWeightingCrateUseless = 0.;
        settings.buildingWeightingMissingFuel = 10;
        settings.buildingWeightingNonOperatingCity = 0.2;
        settings.buildingWeightingNonOperating = 0;
        settings.buildingWeightingTriggerConflict = 0;
        settings.buildingWeightingMissingSupply = 0;
    }

    function resetBuildingSettings() {
        settings.buildingBuildIfStorageFull = false;
        settings.buildingAlwaysClick = false;
        settings.buildingClickPerTick = 50;

        for (let i = 0; i < state.buildingManager.priorityList.length; i++) {
            const building = state.buildingManager.priorityList[i];

            building.autoBuildEnabled = true;
            building.autoStateEnabled = true;
            building._autoMax = -1;
            building._weighting = 100;
        }
    }

    function resetBuildingState() {
        state.buildingManager.clearPriorityList();

        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.SacrificialAltar);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Windmill);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Mill);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SunSwarmControl);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SunSwarmSatellite);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.CoalPower);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.OilPower);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.FissionPower);

        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Apartment);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaLuxuryCondo);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Wardenclyffe);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.BioLab);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Mine);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.CementPlant);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.CoalMine);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Factory);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasMoonOutpost);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.HellGeothermal); // produces power
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BeltSpaceStation); // this building resets ui when clicked
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BeltEleriumShip);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.DwarfEleriumReactor);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BeltIridiumShip);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BeltIronShip);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SpaceNavBeacon);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.MoonBase); // this building resets ui when clicked
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.MoonIridiumMine);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.MoonHeliumMine);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.MoonObservatory);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasMining);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedSpaceport); // this building resets ui when clicked
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedTower);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedLivingQuarters);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaStarport);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaHabitat);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ProximaTransferStation);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedFabrication);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedMine);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedBiodome);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedExoticLab); // this building resets ui when clicked
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasMoonOilExtractor);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.DwarfEleriumContainer);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.DwarfWorldController);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedSpaceBarracks);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.MassDriver);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedFactory);

        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.University);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Smelter);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Temple);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.OilWell);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.StorageYard);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Warehouse);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Bank);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Barracks);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Hospital);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.BootCamp);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.House);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Cottage);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Farm);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.SoulWell); // Evil only
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Silo);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Shed);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.LumberYard);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Foundry);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.OilDepot);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Trade);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Amphitheatre);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Library);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Lodge); // Cath only
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Smokehouse); // Cath only
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Wharf);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.MetalRefinery);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.SlavePen); // Evil only
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.SlaveMarket); // Evil only
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Graveyard); // Evil only
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Shrine); // Celestial only
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.CompostHeap); // Moldling only
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Pylon); // Magic Universe only

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SpaceTestLaunch);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SpaceSatellite);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SpaceGps);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SpacePropellantDepot);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.MoonMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedGarage);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedZiggurat);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.HellMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.HellSwarmPlant);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SunMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasStorage);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasSpaceDock);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasSpaceDockProbe);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasSpaceDockShipSegment);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasMoonMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasMoonDrone);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BeltMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.DwarfMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.DwarfWorldCollider);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaMiningDroid);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaProcessing);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaFusion);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaLaboratory);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaExchange);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaFactory);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaWarehouse);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ProximaMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ProximaCargoYard);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ProximaCruiser);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ProximaDyson);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ProximaDysonSphere);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ProximaOrichalcumSphere);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NebulaMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NebulaNexus);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NebulaHarvestor);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NebulaEleriumProspector);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NeutronMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NeutronMiner);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.Blackhole);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BlackholeFarReach);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BlackholeStellarEngine);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BlackholeMassEjector);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalTurret);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalSensorDrone);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalWarDroid);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalWarDrone);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalAttractor);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalCarport);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalSoulForge);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalGunEmplacement);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalSoulAttractor);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalRepairDroid);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalPitMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalAssaultForge);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BlackholeJumpShip);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BlackholeWormholeMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BlackholeStargate);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BlackholeCompletedStargate);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaMegaFactory);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NeutronStellarForge);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusAnalysis);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusSpaceElevator);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusGravityDome);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusAscensionTrigger); // This is the 10,000 power one
        //state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusAscend); // This is performing the actual ascension. We'll deal with this in prestige automation
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusThermalCollector);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NeutronCitadel);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.HellSpaceCasino);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Casino);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.TouristCenter);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.RockQuarry);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Sawmill);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedVrCenter);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusAscensionMachine);
    }

    function resetProjectSettings() {
        settings.arpaBuildIfStorageFull = true;
        settings.arpaBuildIfStorageFullCraftableMin = -1;
        settings.arpaBuildIfStorageFullResourceMaxPercent = 5;
    }

    function resetProjectState() {
        state.projectManager.clearPriorityList();
        state.projectManager.addProjectToPriorityList(state.projects.SuperCollider);
        state.projectManager.addProjectToPriorityList(state.projects.StockExchange);
        state.projectManager.addProjectToPriorityList(state.projects.Monument);
        state.projectManager.addProjectToPriorityList(state.projects.Railway);
        state.projectManager.addProjectToPriorityList(state.projects.LaunchFacility);

        for (let i = 0; i < state.projectManager.priorityList.length; i++) {
            state.projectManager.priorityList[i]._autoMax = -1;
        }
    }

    function resetProductionSettings() {
        settings.productionMoneyIfOnly = true;
        settings.productionPrioritizeDemanded = true;
        settings.productionMinRatio = 0.1;
    }

    function resetProductionState() {
        // Smelter settings
        state.cityBuildings.Smelter.clearFuelPriorityList();
        state.cityBuildings.Smelter.addFuelToPriorityList(new SmelterFuel(resources.Oil));
        state.cityBuildings.Smelter.addFuelToPriorityList(new SmelterFuel(resources.Coal));
        state.cityBuildings.Smelter.addFuelToPriorityList(new SmelterFuel(resources.Lumber));

        // Factory settings
        let productionSettings = state.cityBuildings.Factory.productionOptions;
        for (let i = 0; i < productionSettings.length; i++) {
            const production = productionSettings[i];

            production.enabled = true;
            if (production.goods === FactoryGoods.LuxuryGoods) {
                production.weighting = 1;
                production.enabled = false;
            }
            if (production.goods === FactoryGoods.Furs) {
                production.weighting = 0;
                production.enabled = false;
            }
            if (production.goods === FactoryGoods.Alloy) production.weighting = 2;
            if (production.goods === FactoryGoods.Polymer) production.weighting = 1;
            if (production.goods === FactoryGoods.NanoTube) production.weighting = 8;
            if (production.goods === FactoryGoods.Stanene) production.weighting = 8;
        }

        // Foundry settings
        for (let i = 0; i < state.craftableResourceList.length; i++) {
            const resource = state.craftableResourceList[i];
            resource.autoCraftEnabled = true;
        }
        resources.Plywood.weighting = 20;
        resources.Brick.weighting = 20;
        resources.Wrought_Iron.weighting = 20;
        resources.Sheet_Metal.weighting = 50;
        resources.Mythril.weighting = 5;
        resources.Aerogel.weighting = 1;
        resources.Nanoweave.weighting = 1;
        resources.Scarletite.weighting = 1;
    }

    function resetTriggerSettings() {
        settings.triggerRequest = true;
    }

    function resetTriggerState() {
        state.triggerManager.clearPriorityList();
    }

    function resetLoggingSettings() {
        settings["logEnabled"] = true;

        Object.keys(loggingTypes).forEach(loggingTypeKey => {
            let loggingType = loggingTypes[loggingTypeKey];
            settings[loggingType.settingKey] = true;
        });
    }

    var settingsSections = ["generalSettingsCollapsed", "prestigeSettingsCollapsed", "evolutionSettingsCollapsed", "researchSettingsCollapsed", "marketSettingsCollapsed", "storageSettingsCollapsed",
                            "productionSettingsCollapsed", "warSettingsCollapsed", "hellSettingsCollapsed", "jobSettingsCollapsed", "buildingSettingsCollapsed", "projectSettingsCollapsed",
                            "governmentSettingsCollapsed", "loggingSettingsCollapsed", "minorTraitSettingsCollapsed", "weightingSettingsCollapsed"];

    function updateStateFromSettings() {
        updateStandAloneSettings();

        settings.triggers = settings.triggers || [];

        state.triggerManager.clearPriorityList();
        settings.triggers.forEach(trigger => {
            state.triggerManager.AddTriggerFromSetting(trigger.seq, trigger.priority, trigger.requirementType, trigger.requirementId, trigger.requirementCount, trigger.actionType, trigger.actionId, trigger.actionCount);
        });

        // Retrieve settings for battle
        for (let i = 0; i < state.warManager.campaignList.length; i++) {
            let campaign = state.warManager.campaignList[i];

            let settingKey = 'btl_' + campaign.name;
            if (settings.hasOwnProperty(settingKey)) {
                campaign.rating = parseFloat(settings[settingKey]);
            } else {
                settings[settingKey] = campaign.rating;
            }

            settingKey = 'btl_max_' + campaign.name;
            if (settings.hasOwnProperty(settingKey)) {
                campaign.maxRating = parseFloat(settings[settingKey]);
            } else {
                settings[settingKey] = campaign.maxRating;
            }
        }

        // Retrieve settings for resources
        for (let i = 0; i < state.marketManager.priorityList.length; i++) {
            let resource = state.marketManager.priorityList[i];

            let settingKey = 'res_buy_p_' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.marketPriority = parseInt(settings[settingKey]); }
            else { settings[settingKey] = resource.marketPriority; }

            settingKey = 'buy' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.autoBuyEnabled = settings[settingKey]; }
            else { settings[settingKey] = resource.autoBuyEnabled; }

            settingKey = 'res_buy_r_' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.autoBuyRatio = parseFloat(settings[settingKey]); }
            else { settings[settingKey] = resource.autoBuyRatio; }

            settingKey = 'sell' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.autoSellEnabled = settings[settingKey]; }
            else { settings[settingKey] = resource.autoSellEnabled; }

            settingKey = 'res_sell_r_' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.autoSellRatio = parseFloat(settings[settingKey]); }
            else { settings[settingKey] = resource.autoSellRatio; }

            settingKey = 'res_trade_buy_' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.autoTradeBuyEnabled = settings[settingKey]; }
            else { settings[settingKey] = resource.autoTradeBuyEnabled; }

            settingKey = 'res_trade_buy_mtr_' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.autoTradeBuyRoutes = parseInt(settings[settingKey]); }
            else { settings[settingKey] = resource.autoTradeBuyRoutes; }

            settingKey = 'res_trade_sell_' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.autoTradeSellEnabled = settings[settingKey]; }
            else { settings[settingKey] = resource.autoTradeSellEnabled; }

            settingKey = 'res_trade_sell_mps_' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.autoTradeSellMinPerSecond = parseFloat(settings[settingKey]); }
            else { settings[settingKey] = resource.autoTradeSellMinPerSecond; }
        }
        state.marketManager.sortByPriority();

        for (let i = 0; i < state.storageManager.priorityList.length; i++) {
            let resource = state.storageManager.priorityList[i];

            let settingKey = 'res_storage' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.autoStorageEnabled = settings[settingKey]; }
            else { settings[settingKey] = resource.autoStorageEnabled; }

            settingKey = 'res_storage_o_' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.storeOverflow = settings[settingKey]; }
            else { settings[settingKey] = resource.storeOverflow; }

            settingKey = 'res_storage_p_' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.storagePriority = parseFloat(settings[settingKey]); }
            else { settings[settingKey] = resource.storagePriority; }

            settingKey = 'res_crates_m_' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource._autoCratesMax = parseInt(settings[settingKey]); }
            else { settings[settingKey] = resource._autoCratesMax; }

            settingKey = 'res_containers_m_' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource._autoContainersMax = parseInt(settings[settingKey]); }
            else { settings[settingKey] = resource._autoContainersMax; }
        }
        state.storageManager.sortByPriority();

        for (let i = 0; i < state.minorTraitManager.priorityList.length; i++) {
            let trait = state.minorTraitManager.priorityList[i];

            let settingKey = 'mTrait_' + trait.traitName;
            if (settings.hasOwnProperty(settingKey)) { trait.autoMinorTraitEnabled = settings[settingKey]; }
            else { settings[settingKey] = trait.autoMinorTraitEnabled; }

            settingKey = 'mTrait_w_' + trait.traitName;
            if (settings.hasOwnProperty(settingKey)) { trait.autoMinorTraitWeighting = parseFloat(settings[settingKey]); }
            else { settings[settingKey] = trait.autoMinorTraitWeighting; }

            settingKey = 'mTrait_p_' + trait.traitName;
            if (settings.hasOwnProperty(settingKey)) { trait.priority = parseFloat(settings[settingKey]); }
            else { settings[settingKey] = trait.priority; }
        }
        state.minorTraitManager.sortByPriority();

        // Retrieve settings for crafting resources
        for (let i = 0; i < state.craftableResourceList.length; i++) {
            const resource = state.craftableResourceList[i];

            let settingKey = 'craft' + resource.id;
            if (settings.hasOwnProperty(settingKey)) {
                resource.autoCraftEnabled = settings[settingKey];
            } else {
                settings[settingKey] = true;
            }

            settingKey = 'foundry_w_' + resource.id;
            if (settings.hasOwnProperty(settingKey)) {
                resource.weighting = parseFloat(settings[settingKey]);
            } else {
                settings[settingKey] = resource.weighting;
            }
        }

        // Retrieve settings for buying buildings
        for (let i = 0; i < state.buildingManager.priorityList.length; i++) {
            const building = state.buildingManager.priorityList[i];

            let settingKey = 'bat' + building.settingId;
            if (settings.hasOwnProperty(settingKey)) {
                building.autoBuildEnabled = settings[settingKey];
            } else {
                settings[settingKey] = building.autoBuildEnabled;
            }

            settingKey = 'bld_p_' + building.settingId;
            if (settings.hasOwnProperty(settingKey)) {
                building.priority = parseInt(settings[settingKey]);
            } else {
                settings[settingKey] = building.priority;
            }

            settingKey = 'bld_s_' + building.settingId;
            if (settings.hasOwnProperty(settingKey)) {
                building.autoStateEnabled = settings[settingKey];
            } else {
                settings[settingKey] = building.autoStateEnabled;
            }

            settingKey = 'bld_m_' + building.settingId;
            if (settings.hasOwnProperty(settingKey)) {
                building.autoMax = parseInt(settings[settingKey]);
            } else {
                settings[settingKey] = building._autoMax;
            }

            settingKey = 'bld_w_' + building.settingId;
            if (settings.hasOwnProperty(settingKey)) {
                building._weighting = parseFloat(settings[settingKey]);
            } else {
                settings[settingKey] = building._weighting;
            }
        }
        state.buildingManager.sortByPriority();

        // Retrieve settings for assigning jobs
        for (let i = 0; i < state.jobManager.priorityList.length; i++) {
            const job = state.jobManager.priorityList[i];

            let settingKey = 'job_' + job._originalId;
            if (settings.hasOwnProperty(settingKey)) {
                job.autoJobEnabled = settings[settingKey];
            } else {
                settings[settingKey] = true;
            }

            settingKey = 'job_p_' + job._originalId;
            if (settings.hasOwnProperty(settingKey)) {
                job.priority = parseInt(settings[settingKey]);
            } else {
                settings[settingKey] = job.priority;
            }

            settingKey = 'job_b1_' + job._originalId;
            if (settings.hasOwnProperty(settingKey)) {
                job.setBreakpoint(1, settings[settingKey]);
            } else {
                settings[settingKey] = job.getBreakpoint(1);
            }

            settingKey = 'job_b2_' + job._originalId;
            if (settings.hasOwnProperty(settingKey)) {
                job.setBreakpoint(2, settings[settingKey]);
            } else {
                settings[settingKey] = job.getBreakpoint(2);
            }

            settingKey = 'job_b3_' + job._originalId;
            if (settings.hasOwnProperty(settingKey)) {
                job.setBreakpoint(3, settings[settingKey]);
            } else {
                settings[settingKey] = job.getBreakpoint(3);
            }
        }
        state.jobManager.sortByPriority();

        settings.arpa = settings.arpa || {};
        for (let i = 0; i < state.projectManager.priorityList.length; i++) {
            const project = state.projectManager.priorityList[i];

            let settingKey = project.id;
            if (settings.arpa.hasOwnProperty(settingKey)) {
                project.autoBuildEnabled = settings.arpa[settingKey];
            } else {
                settings.arpa[settingKey] = project.autoBuildEnabled;
            }

            settingKey = 'arpa_p_' + project.id;
            if (settings.hasOwnProperty(settingKey)) {
                project.priority = parseInt(settings[settingKey]);
            } else {
                settings[settingKey] = project.priority;
            }

            settingKey = 'arpa_m_' + project.id;
            if (settings.hasOwnProperty(settingKey)) {
                project.autoMax = parseInt(settings[settingKey]);
            } else {
                settings[settingKey] = project._autoMax;
            }

            settingKey = 'arpa_ignore_money_' + project.id;
            if (settings.hasOwnProperty(settingKey)) {
                project.ignoreMinimumMoneySetting = settings[settingKey];
            } else {
                settings[settingKey] = project.ignoreMinimumMoneySetting;
            }
        }
        state.projectManager.sortByPriority();

        let productionSettings = state.cityBuildings.Factory.productionOptions;
        for (let i = 0; i < productionSettings.length; i++) {
            const production = productionSettings[i];

            let settingKey = "production_" + production.resource.id;
            if (settings.hasOwnProperty(settingKey)) {
                production.enabled = settings[settingKey];
            } else {
                settings[settingKey] = production.enabled;
            }

            settingKey = "production_w_" + production.resource.id;
            if (settings.hasOwnProperty(settingKey)) {
                production.weighting = parseInt(settings[settingKey]);
            } else {
                settings[settingKey] = production.weighting;
            }
        }

        for (let i = 0; i < state.cityBuildings.Smelter._fuelPriorityList.length; i++) {
            const fuel = state.cityBuildings.Smelter._fuelPriorityList[i];

            let settingKey = "smelter_fuel_" + fuel.resource.id;
            if (settings.arpa.hasOwnProperty(settingKey)) {
                fuel.enabled = settings.arpa[settingKey];
            } else {
                settings.arpa[settingKey] = fuel.enabled;
            }

            settingKey = "smelter_fuel_p_" + fuel.resource.id;
            if (settings.hasOwnProperty(settingKey)) {
                fuel.priority = parseInt(settings[settingKey]);
            } else {
                settings[settingKey] = fuel.priority;
            }
        }
        state.cityBuildings.Smelter.sortByPriority();
    }

    function updateSettingsFromState() {
        updateStandAloneSettings();

        settings.triggers = state.triggerManager.priorityList;

        // Hack for partial back compatibility with original script.
        for (let i = 0; i < settings.triggers.length; i++) {
            if (settings.triggers[i].requirementType === "unlocked" && settings.triggers[i].actionType === "research") {
                settings.triggers[i].type = "tech";
            }
        }

        for (let i = 0; i < state.warManager.campaignList.length; i++) {
            let campaign = state.warManager.campaignList[i];
            settings['btl_' + campaign.name] = campaign.rating;
            settings['btl_max_' + campaign.name] = campaign.maxRating;
        }

        for (let i = 0; i < state.buildingManager.priorityList.length; i++) {
            const building = state.buildingManager.priorityList[i];
            settings['bat' + building.settingId] = building.autoBuildEnabled;
            settings['bld_p_' + building.settingId] = building.priority;
            settings['bld_s_' + building.settingId] = building.autoStateEnabled;
            settings['bld_m_' + building.settingId] = building._autoMax;
            settings['bld_w_' + building.settingId] = building._weighting;
        }

        for (let i = 0; i < state.craftableResourceList.length; i++) {
            const resource = state.craftableResourceList[i];
            settings['craft' + resource.id] = resource.autoCraftEnabled;
            settings["foundry_w_" + resource.id] = resource.weighting;
        }

        for (let i = 0; i < state.jobManager.priorityList.length; i++) {
            const job = state.jobManager.priorityList[i];
            settings['job_' + job._originalId] = job.autoJobEnabled;
            settings['job_p_' + job._originalId] = job.priority;
            settings['job_b1_' + job._originalId] = job.getBreakpoint(1);
            settings['job_b2_' + job._originalId] = job.getBreakpoint(2);
            settings['job_b3_' + job._originalId] = job.getBreakpoint(3);
        }

        for (let i = 0; i < state.marketManager.priorityList.length; i++) {
            let resource = state.marketManager.priorityList[i];
            settings['res_buy_p_' + resource.id] = resource.marketPriority;
            settings['buy' + resource.id] = resource.autoBuyEnabled;
            settings['res_buy_r_' + resource.id] = resource.autoBuyRatio;
            settings['sell' + resource.id] = resource.autoSellEnabled;
            settings['res_sell_r_' + resource.id] = resource.autoSellRatio;
            settings['res_trade_buy_' + resource.id] = resource.autoTradeBuyEnabled;
            settings['res_trade_buy_mtr_' + resource.id] = resource.autoTradeBuyRoutes;
            settings['res_trade_sell_' + resource.id] = resource.autoTradeSellEnabled;
            settings['res_trade_sell_mps_' + resource.id] = resource.autoTradeSellMinPerSecond;
        }

        for (let i = 0; i < state.storageManager.priorityList.length; i++) {
            const resource = state.storageManager.priorityList[i];
            settings['res_storage' + resource.id] = resource.autoStorageEnabled;
            settings['res_storage_o_' + resource.id] = resource.storeOverflow;
            settings['res_storage_p_' + resource.id] = resource.storagePriority;
            settings['res_crates_m_' + resource.id] = resource._autoCratesMax;
            settings['res_containers_m_' + resource.id] = resource._autoContainersMax;
        }

        for (let i = 0; i < state.minorTraitManager.priorityList.length; i++) {
            const trait = state.minorTraitManager.priorityList[i];
            settings['mTrait_' + trait.traitName] = trait.autoMinorTraitEnabled;
            settings['mTrait_w_' + trait.traitName] = trait.autoMinorTraitWeighting;
            settings['mTrait_p_' + trait.traitName] = trait.priority;
        }

        settings.arpa = settings.arpa || {};
        for (let i = 0; i < state.projectManager.priorityList.length; i++) {
            const project = state.projectManager.priorityList[i];
            settings.arpa[project.id] = project.autoBuildEnabled;
            settings['arpa_p_' + project.id] = project.priority;
            settings['arpa_m_' + project.id] = project._autoMax;
            settings['arpa_ignore_money_' + project.id] = project.ignoreMinimumMoneySetting;
        }

        let productionSettings = state.cityBuildings.Factory.productionOptions;
        for (let i = 0; i < productionSettings.length; i++) {
            const production = productionSettings[i];
            settings["production_" + production.resource.id] = production.enabled;
            settings["production_w_" + production.resource.id] = production.weighting;
        }

        for (let i = 0; i < state.cityBuildings.Smelter._fuelPriorityList.length; i++) {
            const fuel = state.cityBuildings.Smelter._fuelPriorityList[i];
            settings["smelter_fuel_" + fuel.resource.id] = fuel.enabled;
            settings["smelter_fuel_p_" + fuel.resource.id] = fuel.priority;
        }

        localStorage.setItem('settings', JSON.stringify(settings));
    }

    /**
     * @param {string} settingName
     * @param {any} defaultValue
     */
    function addSetting(settingName, defaultValue) {
        if (!settings.hasOwnProperty(settingName)) {
            settings[settingName] = defaultValue;
        }
    }

    function updateStandAloneSettings() {
        settings['scriptName'] = "TMVictor";

        addSetting("evolutionIgnore", {});
        addSetting("evolutionQueue", []);
        addSetting("evolutionQueueEnabled", false);

        addSetting("storageLimitPreMad", true);
        addSetting("storageSafeReassign", true);
        addSetting("arpaBuildIfStorageFull", true);
        addSetting("arpaBuildIfStorageFullCraftableMin", -1);
        addSetting("arpaBuildIfStorageFullResourceMaxPercent", 5);

        addSetting("productionMoneyIfOnly", true);
        addSetting("productionPrioritizeDemanded", true);
        addSetting("productionMinRatio", 0.1);

        addSetting("jobSetDefault", true);
        addSetting("jobLumberWeighting", 50);
        addSetting("jobQuarryWeighting", 50);
        addSetting("jobCrystalWeighting", 50);
        addSetting("jobScavengerWeighting", 50);

        addSetting("masterScriptToggle", true);
        addSetting("showSettings", true);
        addSetting("autoEvolution", false);
        addSetting("autoMarket", false);
        addSetting("autoFight", false);
        addSetting("autoCraft", false);
        addSetting("autoARPA", false);
        addSetting("autoBuild", false);
        addSetting("autoResearch", false);
        addSetting("autoJobs", false);
        addSetting("autoTax", false);
        addSetting("autoCraftsmen", false);
        addSetting("autoPower", false);
        addSetting("autoStorage", false);
        addSetting("autoMinorTrait", false);
        addSetting("autoHell", false);

        addSetting("logEnabled", true);
        Object.keys(loggingTypes).forEach(loggingTypeKey => {
            let loggingType = loggingTypes[loggingTypeKey];
            addSetting(loggingType.settingKey, true)
        });

        // Move autoTradeSpecialResources to autoStorage and the delete the setting as it has been moved to autoMarket
        if (settings.hasOwnProperty("autoTradeSpecialResources")) {
            settings.autoStorage = settings.autoTradeSpecialResources;
            delete settings.autoTradeSpecialResources;
        }

        addSetting("autoSmelter", false);
        addSetting("autoFactory", false);
        addSetting("autoMiningDroid", false);
        addSetting("autoGraphenePlant", false);
        addSetting("prestigeType", "none");
        addSetting("autoSpace", false);
        addSetting("prestigeBioseedConstruct", false);
        addSetting("prestigeBioseedProbes", 3);
        addSetting("prestigeWhiteholeMinMass", 8);
        addSetting("prestigeWhiteholeStabiliseMass", true);
        addSetting("prestigeWhiteholeEjectEnabled", true);
        addSetting("prestigeWhiteholeDecayRate", 0.2);
        addSetting("prestigeWhiteholeEjectAllCount", 5);

        addSetting("autoAssembleGene", false);
        addSetting("genesAssembleGeneAlways", false);

        addSetting("minimumMoney", 0);
        addSetting("minimumMoneyPercentage", 0);
        addSetting("queueRequest", true);
        addSetting("tradeRouteMinimumMoneyPerSecond", 300);
        addSetting("tradeRouteMinimumMoneyPercentage", 5);
        addSetting("generalMinimumTaxRate", 0);
        addSetting("generalMinimumMorale", 105)
        addSetting("generalMaximumMorale", 500);
        addSetting("govManage", false);
        addSetting("govInterim", governmentTypes.democracy.id);
        addSetting("govFinal", governmentTypes.technocracy.id);
        addSetting("govSpace", governmentTypes.corpocracy.id);

        addSetting("foreignAttackLivingSoldiersPercent", 100);
        addSetting("foreignAttackHealthySoldiersPercent", 100);
        addSetting("foreignHireMercMoneyStoragePercent", 90);
        addSetting("foreignHireMercCostLowerThan", 50000);

        addSetting("foreignPacifist", false);
        addSetting("foreignUnification", true);
        addSetting("foreignForceSabotage", true);
        addSetting("foreignOccupyLast", true);
        addSetting("foreignTrainSpy", true);
        addSetting("foreignSpyMax", 2);
        addSetting("foreignPowerRequired", 75);
        addSetting("foreignPolicyInferior", "Annex");
        addSetting("foreignPolicySuperior", "Sabotage");

        addSetting("hellTurnOffLogMessages", true);
        addSetting("hellHandlePatrolCount", true);
        addSetting("hellHomeGarrison", 20);
        addSetting("hellMinSoldiers", 20);
        addSetting("hellMinSoldiersPercent", 90);

        addSetting("hellTargetFortressDamage", 100);
        addSetting("hellLowWallsMulti", 3);

        addSetting("hellHandlePatrolSize", true);
        addSetting("hellPatrolMinRating", 80);
        addSetting("hellPatrolThreatPercent", 8);
        addSetting("hellPatrolDroneMod", 5);
        addSetting("hellPatrolDroidMod", 5);
        addSetting("hellPatrolBootcampMod", 0);
        addSetting("hellBolsterPatrolPercentTop", 80);
        addSetting("hellBolsterPatrolPercentBottom", 40);
        addSetting("hellBolsterPatrolRating", 300);

        addSetting("hellHandleAttractors", true);
        addSetting("hellAttractorTopThreat", 3000);
        addSetting("hellAttractorBottomThreat", 1300);

        addSetting("userUniverseTargetName", "none");
        addSetting("userPlanetTargetName", "none");
        addSetting("userEvolutionTarget", "auto");

        for (let i = 0; i < state.evolutionChallengeList.length; i++) {
            const challenge = state.evolutionChallengeList[i];

            if (challenge.id !== state.evolutions.Bunker.id) {
                addSetting("challenge_" + challenge.id, false);
            }
        }

        addSetting("userResearchTheology_1", "auto");
        addSetting("userResearchTheology_2", "auto");

        addSetting("buildingBuildIfStorageFull", false);
        addSetting("buildingAlwaysClick", false);
        addSetting("buildingClickPerTick", 50);
        addSetting("buildingWeightingNew", 3);
        addSetting("buildingWeightingUselessPowerPlant", 0);
        addSetting("buildingWeightingNeedfulPowerPlant", 3);
        addSetting("buildingWeightingUnderpowered", 0.8);
        addSetting("buildingWeightingUselessKnowledge", 0.1);
        addSetting("buildingWeightingNeedfulKnowledge", 5);
        addSetting("buildingWeightingUnusedEjectors", 0.1);
        addSetting("buildingWeightingMADUseless", 0);
        addSetting("buildingWeightingCrateUseless", 0);
        addSetting("buildingWeightingMissingFuel", 10);
        addSetting("buildingWeightingNonOperatingCity", 0.2);
        addSetting("buildingWeightingNonOperating", 0);
        addSetting("buildingWeightingTriggerConflict", 0);
        addSetting("buildingWeightingMissingSupply", 0);

        addSetting("buildingEnabledAll", false);
        addSetting("buildingStateAll", false);

        addSetting("triggerRequest", true);

        // Collapse or expand settings sections
        for (let i = 0; i < settingsSections.length; i++) {
            addSetting(settingsSections[i], true);
        }
    }

    // #endregion State and Initialisation

    //#region Auto Evolution

    function getConfiguredAchievementLevel() {
        let a_level = 1;
        if (settings.challenge_plasmid || settings.challenge_mastery) { a_level++; }
        if (settings.challenge_trade) { a_level++; }
        if (settings.challenge_craft) { a_level++; }
        if (settings.challenge_crispr) { a_level++; }
        return a_level;
    }

    function isAchievementUnlocked(id, level) {
        let universe = "l";
        switch (game.global.race.universe){
            case 'antimatter':
                universe = "a";
                break;
            case 'heavy':
                universe = "h";
                break;
            case 'evil':
                universe = "e";
                break;
            case 'micro':
                universe = "m";
                break;
            case 'magic':
                universe = "mg";
                break;
        }
        return game.global.stats.achieve[id] && game.global.stats.achieve[id][universe] && game.global.stats.achieve[id][universe] >= level;
    }

    function autoEvolution() {
        if (game.global.race.species !== speciesProtoplasm) {
            return;
        }

        // Load queued settings first, before choosing universe or planet - in case if they're need to be overriden
        if (state.evolutionTarget === null && settings.evolutionQueueEnabled && settings.evolutionQueue.length > 0) {
            let queuedEvolution = settings.evolutionQueue.shift();
            for (let [settingName, settingValue] of Object.entries(queuedEvolution)) {
                if (typeof settings[settingName] === typeof settingValue) {
                    settings[settingName] = settingValue;
                } else {
                    console.log(`Type mismatch during loading queued settings: 
                        settings.${settingName} type: ${typeof settings[settingName]}, value: ${settings[settingName]}; 
                        queuedEvolution.${settingName} type: ${typeof settingValue}, value: ${settingValue};`);
                }
            }
            state.evolutionTarget = races.antid; // That's a hack to not pull another evolution from queue while player selecting universe
            state.resetEvolutionTarget = true;
            //updateStateFromSettings();
            updateSettingsFromState();
            buildScriptSettings();
        }

        autoUniverseSelection();
        // If we have performed a soft reset with a bioseeded ship then we get to choose our planet
        autoPlanetSelection();

        // Wait for universe and planet, we don't want to run auto achievement until we'll land somewhere
        if (game.global.race.universe === 'bigbang' || (game.global.race.seeded && !game.global.race['chose'])) {
            return;
        }

        if (state.resetEvolutionTarget) {
            state.resetEvolutionTarget = false;
            state.evolutionTarget = null;
        }

        if (state.evolutionTarget === null) {
            // Try to pick race for achievement first
            if (settings.userEvolutionTarget === "auto") {
                // Determine star level based on selected challenges and use it to check if achievements for that level have been... achieved
                let achievementLevel = getConfiguredAchievementLevel();
                let targetedGroup = { group: null, race: null, remainingPercent: 0 };

                for (let i = 0; i < state.raceGroupAchievementList.length; i++) {
                    // Skip if we already tried that group, and failed
                    if (settings.evolutionBackup && settings.evolutionIgnore[i]) {
                      continue;
                    }
                    const raceGroup = state.raceGroupAchievementList[i];
                    let remainingAchievements = 0;
                    let remainingRace = null;

                    for (let j = 0; j < raceGroup.length; j++) {
                        const race = raceGroup[j];
                        if (!race.isMadAchievementUnlocked(achievementLevel) && race.evolutionCondition()) { // Pick races who met conditions
                            remainingRace = race;
                            remainingAchievements++;
                        }
                    }

                    // If we have Mass Extinction perk, and not affected by randomness - prioritize conditional races
                    if (game.global.stats.achieve['mass_extinction'] && remainingAchievements > 0 && remainingRace.evolutionConditionText !== '') {
                        targetedGroup.group = raceGroup;
                        targetedGroup.race = remainingRace;
                        targetedGroup.remainingPercent = 100;
                    }

                    // We'll target the group with the highest percentage chance of getting an achievement
                    let remainingPercent = remainingAchievements / raceGroup.length;

                    // If this group has the most races left with remaining achievements then target an uncompleted race in this group
                    if (remainingPercent > targetedGroup.remainingPercent) {
                        targetedGroup.group = raceGroup;
                        targetedGroup.race = remainingRace;
                        targetedGroup.remainingPercent = remainingPercent;
                    }
                }

                if (targetedGroup.group != null) { state.evolutionTarget = targetedGroup.race; }
            }

            // Auto Achievements disabled, checking user specified race
            if (settings.userEvolutionTarget !== "auto") {
                let userRace = races[settings.userEvolutionTarget];
                if (userRace && userRace.evolutionCondition()){
                    // Race specified, and condition is met
                    state.evolutionTarget = userRace
                }
            }

            // Still no target. Fallback to antid.
            if (state.evolutionTarget === null) {
                state.evolutionTarget = races.antid;
            }
            state.log.logSuccess(loggingTypes.special, `Attempting evolution of ${state.evolutionTarget.name}.`);
        }

        // Apply challenges
        for (let i = 0; i < state.evolutionChallengeList.length; i++) {
            let challenge = state.evolutionChallengeList[i];

            if (challenge === state.evolutions.Bunker || settings["challenge_" + challenge.id]) {
                if (!game.global.race[challenge.effectId] || game.global.race[challenge.effectId] !== 1) {
                    challenge.click(1)
                }
            }
        }

        // Calculate the maximum RNA and DNA required to evolve and don't build more than that
        let maxRNA = 0;
        let maxDNA = 0;

        for (let i = 0; i < state.evolutionTarget.evolutionTree.length; i++) {
            const evolution = state.evolutionTarget.evolutionTree[i];
            const costs = evolution.definition.cost;

            if (costs["RNA"]) {
                let rnaCost = game.adjustCosts(Number(evolution.definition.cost["RNA"]()) || 0);
                maxRNA = Math.max(maxRNA, rnaCost);
            }

            if (costs["DNA"]) {
                let dnaCost = game.adjustCosts(Number(evolution.definition.cost["DNA"]()) || 0);
                maxDNA = Math.max(maxDNA, dnaCost);
            }
        }

        // Gather some resources and evolve (currently targeting Antids)
        // 320 is the max rna / dna that is required... currently
        state.evolutions.Rna.click(Math.min(maxRNA, resources.RNA.maxQuantity - resources.RNA.currentQuantity));
        state.evolutions.Dna.click(Math.min(maxDNA, resources.DNA.maxQuantity - resources.DNA.currentQuantity));
        state.evolutions.Rna.click(Math.min(maxRNA, resources.RNA.maxQuantity - resources.RNA.currentQuantity));

        // Lets go for our targeted evolution
        let targetedEvolutionFound = false;
        for (let i = 0; i < state.evolutionTarget.evolutionTree.length; i++) {
            if (state.evolutionTarget.evolutionTree[i].isUnlocked()) {
                targetedEvolutionFound = true;

                if (state.evolutionTarget.evolutionTree[i].click(1)) {
                    // If we successfully click the action then return to give the ui some time to refresh
                    return;
                } else {
                    // Our path is unlocked but we can't click it yet
                    break;
                }
            }
        }

        if ((resources.RNA.maxQuantity < maxRNA || resources.DNA.maxQuantity < maxDNA)) {
            state.evolutions.Mitochondria.click(1);
        }
        if (resources.DNA.maxQuantity < maxDNA) {
            state.evolutions.EukaryoticCell.click(1);
        }
        if (resources.RNA.maxQuantity < maxRNA) {
            state.evolutions.Membrane.click(1);
        }
        if (state.evolutions.Nucleus.clickIfCountLessThan(10)) {
            return;
        }
        if (state.evolutions.Organelles.clickIfCountLessThan(10)) {
            return;
        }
    }

    function autoUniverseSelection() {
        if (!game.global.race['bigbang']) { return; }
        if (game.global.race.universe !== 'bigbang') { return; }
        if (settings.userUniverseTargetName === 'none') { return; }

        var action = document.getElementById(`uni-${settings.userUniverseTargetName}`);

        if (action !== null) {
            logClick(action.children[0], `Select universe: ${settings.userUniverseTargetName}`);
        }
    }

    function autoPlanetSelection() {
        if (!game.global.race.seeded || game.global.race['chose']) { return; }
        if (settings.userPlanetTargetName === 'none') { return; }

        // This section is for if we bioseeded life and we get to choose our path a little bit
        let planetNodes = document.querySelectorAll('#evolution .action');

        let planets = [];
        for (let i = 0; i < planetNodes.length; i++) {
            let planetNode = planetNodes[i];
            try {
                let planetTitle = planetNode.innerText.split(" ");
                let planet = {id: planetNode.id};

                let planetTraitName = null;
                let planetBiomeName = null;

                // Planets titles consists of two or three parts: [Optional trait] Biome ID
                if (planetTitle.length === 3) {
                    planetTraitName = planetTitle[0];
                    planetBiomeName = planetTitle[1];
                } else {
                    planetBiomeName = planetTitle[0];
                }

                // Parsing titles
                for (let j = 0; j < planetBiomes.length; j++){
                    if (planetBiomeName === game.loc("biome_" +  planetBiomes[j] + "_name")) {
                        planet.biome = planetBiomes[j];
                        break;
                    }
                }
                if (!planet.biome) { throw true; }

                if (planetTraitName) {
                    for (let j = 0; j < planetTraits.length; j++){
                        if (planetTraitName === game.loc("planet_" + planetTraits[j])) {
                            planet.trait = planetTraits[j];
                            break;
                        }
                    }
                    if (!planet.trait) { throw true; }
                }

                planets.push(planet);
            } catch {
                console.log("Failed to parse planet: " + planetNode.innerText);
                continue;
            }
        }

        if (settings.userPlanetTargetName === "habitable") {
            planets.sort((a, b) => (planetBiomes.indexOf(a.biome) + planetTraits.indexOf(a.trait)) - 
                                   (planetBiomes.indexOf(b.biome) + planetTraits.indexOf(b.trait)));
        }

        if (settings.userPlanetTargetName === "achieve") {
            // Let's try to calculate how many achievements we can get here
            let alevel = getConfiguredAchievementLevel();
            for (let i = 0; i < planets.length; i++){
                let planet = planets[i];
                planet.achieve = 0;

                if (!isAchievementUnlocked("biome_" + planet.biome, alevel)) {
                    planet.achieve++;
                }
                if (!isAchievementUnlocked("atmo_" + planet.trait, alevel)) {
                    planet.achieve++;
                }
                if (planetBiomeRaces[planet.biome]) {
                    for (let j = 0; j < planetBiomeRaces[planet.biome].length; j++) {
                        let race = planetBiomeRaces[planet.biome][j];
                        if (!isAchievementUnlocked("extinct_" + race, alevel)) {
                            planet.achieve++;
                        }
                    }
                    // Both races have same genus, no need to check both
                    let genus = game.races[planetBiomeRaces[planet.biome][0]].type;
                    if (!isAchievementUnlocked("genus_" + genus, alevel)) {
                        planet.achieve++;
                    }
                }
            }

            planets.sort((a, b) => a.achieve !== b.achieve ? b.achieve - a.achieve : 
                                   (planetBiomes.indexOf(a.biome) + planetTraits.indexOf(a.trait)) - 
                                   (planetBiomes.indexOf(b.biome) + planetTraits.indexOf(b.trait)));
        }

        // This one is a little bit special. We need to trigger the "mouseover" first as it creates a global javascript varaible
        // that is then destroyed in the "click"
        if (planets.length > 0) {
            let selectedPlanet = planets[0].id;
            let evObj = document.createEvent("Events");
            evObj.initEvent("mouseover", true, false);
            document.getElementById(selectedPlanet).dispatchEvent(evObj);
            logClick(document.getElementById(selectedPlanet).children[0], "select planet");
        }
    }

    function evolutionPlanetSelection (potentialPlanets, planetType) {
        for (let i = 0; i < potentialPlanets.length; i++) {
            if (potentialPlanets[i].id.startsWith(planetType)) {
                return potentialPlanets[i].id;
            }
        }

        return "";
    }

    //#endregion Auto Evolution

    //#region Auto Crafting

    function autoCraft() {
        if (!resources.Population.isUnlocked()) { return; }
        if (game.global.race[challengeNoCraft]) { return; }

        for (let i = 0; i < state.craftableResourceList.length; i++) {
            let craftable = state.craftableResourceList[i];
            if (!craftable.isUnlocked()) {
                continue;
            }

            if (craftable.autoCraftEnabled) {
                let craftRatio = getCraftRatio(craftable);
                let tryCraft = true;

                //console.log("resource: " + craftable.id + ", length: " + craftable.requiredResources.length);
                for (let i = 0; i < craftable.resourceRequirements.length; i++) {
                    //console.log("resource: " + craftable.id + " required resource: " + craftable.requiredResources[i].id);
                    if (craftable.resourceRequirements[i].resource.storageRatio < craftRatio) {
                        tryCraft = false;
                    }
                }

                if (tryCraft) {
                    craftable.tryCraftX(5);
                }
            }
        }
    }

    function missResourceForBuilding(building, count, resource) {
      if (building.count < count) {
        let resourceRequirement = building.resourceRequirements.find(requirement => requirement.resource === resource);
        if (resourceRequirement !== undefined && resource.currentQuantity < resourceRequirement.quantity) {
          return true;
        }
      }
      return false;
    }

    /**
     * @param {Resource} craftable
     */
    function getCraftRatio(craftable) {
        let craftRatio = 0.9;
        // We want to get to a healthy number of buildings that require craftable materials so leaving crafting ratio low early
        if (missResourceForBuilding(state.cityBuildings.Library, 20, craftable)) {
            craftRatio = state.cityBuildings.Library.count * 0.025;
        }
        if (missResourceForBuilding(state.cityBuildings.Cottage, 20, craftable)) {
            craftRatio = state.cityBuildings.Cottage.count * 0.025;
        }
        if (missResourceForBuilding(state.cityBuildings.Wardenclyffe, 20, craftable)) {
            craftRatio = state.cityBuildings.Wardenclyffe.count * 0.025;
        }
        // Iron tends to be in high demand, make sure we have enough wrought for at least one coal mine, to start collecting coal for researches as soon as possible
        if (missResourceForBuilding(state.cityBuildings.CoalMine, 1, craftable)) {
            craftRatio = 0;
        }

        return craftRatio;
    }

    //#endregion Auto Crafting

    //#region Manage Government

    function manageGovernment() {
        let gm = state.governmentManager;
        if (!gm.isEnabled()) { return; }

        // Check and set space government if possible
        if (isResearchUnlocked("quantum_manufacturing") && gm.isGovernmentUnlocked(settings.govSpace)) {
            if (gm.currentGovernment !== settings.govSpace) {
                gm.setGovernment(settings.govSpace);
            }
            return;
        }

        // Check and set second government if possible
        if (gm.isGovernmentUnlocked(settings.govFinal)) {
            if (gm.currentGovernment !== settings.govFinal) {
                gm.setGovernment(settings.govFinal);
            }
            return;
        }

        // Check and set interim government if possible
        if (gm.isGovernmentUnlocked(settings.govInterim)) {
            if (gm.currentGovernment !== settings.govInterim) {
                gm.setGovernment(settings.govInterim);
            }
            return;
        }
    }

    //#endregion Manage Government

    function manageSpies() {
        if (!state.spyManager.isUnlocked()) { return; }

        // Find out Inferiors, Superiors, and current target
        let rank = [];
        let bestTarget = 0;
        for (let i = 0; i < 3; i++){
            if (getGovPower(i) <= settings.foreignPowerRequired) {
                rank[i] = "Inferior";
                bestTarget = i;
            } else {
                rank[i] = "Superior";
            }
        }

        let lastTarget = bestTarget;
        if (settings.foreignPolicySuperior === "Occupy" || settings.foreignPolicySuperior === "Sabotage"){
            lastTarget = 2;
        }

        if (settings.foreignPacifist) {
            bestTarget = -1;
            lastTarget = -1;
        }

        // Train spies
        if (settings.foreignTrainSpy) {
            let foreignVue = getVueById("foreign");
            for (let i = 0; i < 3; i++){
                let gov = game.global.civic.foreign[`gov${i}`]

                // Government is subdued
                if (gov.occ || gov.anx || gov.buy) {
                    continue;
                }
                // We can't train a spy as the button is disabled (cost or already training)
                if (foreignVue.spy_disabled(i)) {
                    continue;
                }

                let spiesRequired = settings[`foreignSpyMax`];
                if (spiesRequired < 0) {
                    spiesRequired = Math.MAX_SAFE_INTEGER;
                }
                // We need 3 spies to purchase
                if (settings[`foreignPolicy${rank[i]}`] === "Purchase" && spiesRequired < 3) {
                    spiesRequired = 3;
                }

                // We reached the max number of spies allowed
                if (gov.spy >= spiesRequired){
                    continue;
                }

                state.log.logSuccess(loggingTypes.spying, `Training a spy to send against ${getGovName(i)}.`);
                foreignVue.spy(i);
            }
        }

        // We can't use out spies yet
        if (game.global.tech['spy'] < 2) {
            return;
        }

        for (let i = 0; i < 3; i++){
            // Do we have any spies?
            let gov = game.global.civic.foreign[`gov${i}`];
            if (gov.spy < 1) {
                continue;
            }

            // No missions means we're explicitly ignoring it. So be it.
            let espionageMission = espionageTypes[settings[`foreignPolicy${rank[i]}`]];
            if (!espionageMission) {
                continue;
            }

            // Force sabotage, if needed, and we know it's useful
            if (i === bestTarget && settings.foreignForceSabotage && gov.spy > 1 && gov.mil > 50) {
                espionageMission = espionageTypes.Sabotage;
            }

            // Don't waste time and money on last foreign power, if we're going to occupy it
            if (i === lastTarget && settings.foreignOccupyLast &&
                espionageMission !== espionageTypes.Sabotage && espionageMission !== espionageTypes.Occupy){
                continue;
            }

            // Unoccupy power if it's subdued, but we want something different
            if ((gov.anx && espionageMission !== espionageTypes.Annex) ||
                (gov.buy && espionageMission !== espionageTypes.Purchase) ||
                (gov.occ && espionageMission !== espionageTypes.Occupy && (i !== bestTarget || !settings.foreignOccupyLast))){
                getVueById("garrison").campaign(i);
            } else if (!gov.anx && !gov.buy && !gov.occ) {
                state.spyManager.performEspionage(i, espionageMission.id);
            }
        }
    }

    //#region Auto Battle

    function autoBattle() {
        // mercenaries can still be hired once the "foreign" section is hidden by unification so do this before checking if warManager is unlocked
        let mercenariesHired = 0;
        let mercenaryCost = state.warManager.getMercenaryCost();
        let previousSoldiersCount = state.warManager.currentSoldiers;

        while (state.warManager.currentSoldiers < state.warManager.maxSoldiers
                && resources.Money.storageRatio > settings.foreignHireMercMoneyStoragePercent / 100
                && mercenaryCost < settings.foreignHireMercCostLowerThan
                && resources.Money.currentQuantity > mercenaryCost) {
            state.warManager.hireMercenary();
            mercenaryCost = state.warManager.getMercenaryCost();
            mercenariesHired++;

            // Just a bit of saftey to ensure that we did actually hire a mercenary
            if (previousSoldiersCount === state.warManager.currentSoldiers) {
                break;
            }

            previousSoldiersCount = state.warManager.currentSoldiers;
        }

        // Log the interaction
        if (mercenariesHired === 1) {
            state.log.logSuccess(loggingTypes.mercenary, `Hired a mercenary to join the garrison.`);
        } else if (mercenariesHired > 1) {
            state.log.logSuccess(loggingTypes.mercenary, `Hired ${mercenariesHired} mercenaries to join the garrison.`);
        }

        // Don't send our troops out if we're preparing for MAD as we need all troops at home for maximum plasmids
        if (state.goal === "PreparingMAD") {
            state.warManager.hireMercenary(); // but hire mercenaries if we can afford it to get there quicker
            return;
        }

        // Now that we've hired mercenaries we can continue to check the rest of the autofight logic
        if (!state.warManager.isUnlocked()) { return; }

        // Stop here, if we don't want to attack anything
        if (settings.foreignPacifist) { return ; }

        // If we are not fully ready then return
        if (state.warManager.maxCityGarrison <= 0 ||
            state.warManager.woundedSoldiers > (1 - settings.foreignAttackHealthySoldiersPercent / 100) * state.warManager.maxCityGarrison ||
            state.warManager.currentCityGarrison < settings.foreignAttackLivingSoldiersPercent / 100 * state.warManager.maxCityGarrison) {
            return;
        }

        // Find out Inferiors, Superiors, and current target
        let rank = [];
        let bestTarget = 0;
        for (let i = 0; i < 3; i++){
            if (getGovPower(i) <= settings.foreignPowerRequired) {
                rank[i] = "Inferior";
                bestTarget = i;
            } else {
                rank[i] = "Superior";
            }
        }

        let govOccupyIndex = -1;

        // Occupy, if needed
        for (let i = 0; i < 3; i++){
            if (settings[`foreignPolicy${rank[i]}`] === "Occupy" && !game.global.civic.foreign[`gov${i}`].occ) {
                govOccupyIndex = i;
            }
        }

        // Check if we want and can unify
        if (settings.foreignUnification && isResearchUnlocked("unification") && bestTarget !== govOccupyIndex){
            let subdued = 0;
            for (let i = 0; i < 3; i++){
                if (bestTarget !== i &&
                   (game.global.civic.foreign[`gov${i}`].anx ||
                    game.global.civic.foreign[`gov${i}`].buy ||
                    game.global.civic.foreign[`gov${i}`].occ)) {
                    subdued++;
                }
            }
            if (subdued == 2) {
                if (settings.foreignOccupyLast) {
                    // Occupy last force
                    govOccupyIndex = bestTarget;
                } else if (settings[`foreignPolicy${rank[bestTarget]}`] === "Annex" || settings[`foreignPolicy${rank[bestTarget]}`] === "Purchase") {
                    // We want to Annex or Purchase last one, stop attacking so we can influence it
                    bestTarget = -1;
                }
            }
        }

        // We've got the soldiers, they're not wounded and they're ready to go, so charge!
        // switchToBestAttackType returns true when the best attack type is set
        // If we are allowed to occupy a foreign power then we can perform attacks up to seige; otherwise we can only go up to assault so that we don't occupy them
        if (!state.warManager.switchToBestAttackType(govOccupyIndex, bestTarget)) { return; }
        if (state.warManager.selectedGovAttackIndex === -1) { return; }

        // Best attack type is set. Now adjust our battalion size to fit between our campaign attack rating ranges
        let maxSoldiers = state.warManager.getMaxSoldiersForAttackType(state.warManager.selectedGovAttackIndex);
        if (state.warManager.currentBattalion < maxSoldiers && state.warManager.currentCityGarrison > state.warManager.currentBattalion) {
            let soldiersToAdd = Math.min(maxSoldiers - state.warManager.currentBattalion, state.warManager.currentCityGarrison - state.warManager.currentBattalion);

            if (soldiersToAdd > 0) {
                state.warManager.addBattalion(soldiersToAdd);
            }
        } else if (state.warManager.currentBattalion > maxSoldiers) {
            let soldiersToRemove = state.warManager.currentBattalion - maxSoldiers;

            if (soldiersToRemove > 0) {
                state.warManager.removeBattalion(soldiersToRemove);
            }
        }

        for (let i = 0; i < 10; i++) {
            // Don't attack if we don't have at least the target battalion size of healthy soldiers available
            if (Math.min(maxSoldiers, state.warManager.maxCityGarrison) > state.warManager.currentCityGarrison - state.warManager.woundedSoldiers) { return; }

            // Log the interaction
            if (govOccupyIndex >= 0 && state.warManager.campaignList[game.global.civic.garrison.tactic].id === "Siege") {
                state.log.logSuccess(loggingTypes.attack, `Launching ${state.warManager.campaignList[game.global.civic.garrison.tactic].name} campaign for occupation against ${getGovName(govOccupyIndex)}.`)
            } else if (bestTarget >= 0) {
                state.log.logSuccess(loggingTypes.attack, `Launching ${state.warManager.campaignList[game.global.civic.garrison.tactic].name} campaign against ${getGovName(bestTarget)}.`)
            }

            state.warManager.launchCampaign(state.warManager.selectedGovAttackIndex);

            if (state.warManager.woundedSoldiers > (1 - settings.foreignAttackHealthySoldiersPercent / 100) * state.warManager.maxCityGarrison
                 || state.warManager.currentCityGarrison < settings.foreignAttackLivingSoldiersPercent / 100 * state.warManager.maxCityGarrison) {
                     return;
            }
        }
    }

    //#endregion Auto Battle

    //#region Auto Hell

    function autoHell() {
        if (!state.warManager.isHellUnlocked()) { return; }

        if (settings.hellTurnOffLogMessages) {
            if (game.global['portal']['fortress']['notify']) {
                game.global.portal.fortress.notify = "No";
            }

            if (game.global['portal']['fortress']['s_ntfy']) {
                game.global.portal.fortress.s_ntfy = "No";
            }
        }

        state.warManager.updateHell();
    }

    //#endregion Auto Hell

    //#region Auto Jobs

    function autoJobs() {
        let jobList = state.jobManager.managedPriorityList();

        // No jobs unlocked yet
        if (jobList.length === 0) {
            return;
        }

        let farmerIndex = jobList.indexOf(state.jobs.Farmer);
        let quarryWorkerIndex = jobList.indexOf(state.jobs.QuarryWorker);
        let crystalMinerIndex = jobList.indexOf(state.jobs.CrystalMiner);
        let scavengerIndex = jobList.indexOf(state.jobs.Scavenger);

        let lumberjackIndex = -1;
        if (isEvilRace() && !isEvilUniverse()) {
            lumberjackIndex = farmerIndex;
        } else {
            lumberjackIndex = jobList.indexOf(state.jobs.Lumberjack);
        }

        let breakpoint0Max = 0;
        let breakpoint1Max = 0;

        // Cath / Balorg / Imp race doesn't have farmers, unemployed are their farmers
        if (isHunterRace()) {
            for (let i = 0; i < jobList.length; i++) {
                const job = jobList[i];
                breakpoint0Max += job.breakpointEmployees(0);
                breakpoint1Max += job.breakpointEmployees(1);
            }

            log("autoJobs", "Max breakpoint 0: " + breakpoint0Max)
            log("autoJobs", "Max breakpoint 1: " + breakpoint1Max)
        }

        let availableEmployees = state.jobManager.totalEmployees;
        let availableCraftsmen = state.jobManager.craftingMax;

        // We're only crafting wheh we have enough population to fill all foundries, and still have some employees for other work.  Second part should always be true, usnless you starved to death most of your population...
        if (settings.autoCraftsmen && availableEmployees > availableCraftsmen * 4) {
            availableEmployees -= availableCraftsmen;
        } else {
            availableCraftsmen = 0;
        }

        let requiredJobs = [];
        let jobAdjustments = [];

        log("autoJobs", "Total employees: " + availableEmployees);

        // First figure out how many farmers are required
        if (state.jobs.Farmer.isManaged()) {
            if (!state.jobs.Lumberjack.isUnlocked()
                    && !state.jobs.QuarryWorker.isUnlocked()
                    && !state.jobs.CrystalMiner.isUnlocked()
                    && !state.jobs.Scavenger.isUnlocked()
                    && !state.jobs.Miner.isUnlocked()
                    && !state.jobs.CoalMiner.isUnlocked()
                    && !state.jobs.CementWorker.isUnlocked()
                    && !state.jobs.Entertainer.isUnlocked()
                    && !state.jobs.Priest.isUnlocked()
                    && !state.jobs.Professor.isUnlocked()
                    && !state.jobs.Scientist.isUnlocked()
                    && !state.jobs.Banker.isUnlocked()
                    && !state.jobs.Colonist.isUnlocked()
                    && !state.jobs.SpaceMiner.isUnlocked()
                    && !state.jobs.HellSurveyor.isUnlocked()) {
                // No other jobs are unlocked - everyone on farming!
                requiredJobs[farmerIndex] = availableEmployees;
                log("autoJobs", "Pushing all farmers")
            } else if (resources.Population.currentQuantity > state.lastPopulationCount) {
                let populationChange = resources.Population.currentQuantity - state.lastPopulationCount;
                let farmerChange = state.jobs.Farmer.count - state.lastFarmerCount;

                if (populationChange === farmerChange && resources.Food.calculatedRateOfChange > 0) {
                    requiredJobs[farmerIndex] = Math.max(state.jobs.Farmer.count - populationChange, 0);
                    log("autoJobs", "Removing a farmer due to population growth")
                } else {
                    requiredJobs[farmerIndex] = state.jobs.Farmer.count;
                }
            } else if (resources.Food.storageRatio < 0.2 && resources.Food.calculatedRateOfChange < 0) {
                // We want food to fluctuate between 0.2 and 0.6 only. We only want to add one per loop until positive
                requiredJobs[farmerIndex] = Math.min(state.jobs.Farmer.count + 1, availableEmployees);
                log("autoJobs", "Adding one farmer")
            } else if (resources.Food.storageRatio > 0.6 && resources.Food.calculatedRateOfChange > 0) {
                // We want food to fluctuate between 0.2 and 0.6 only. We only want to remove one per loop until negative
                requiredJobs[farmerIndex] = Math.max(state.jobs.Farmer.count - 1, 0);
                log("autoJobs", "Removing one farmer")
            } else if (resources.Food.storageRatio > 0.3 && resources.Food.calculatedRateOfChange > 100) {
                // If we have over 30% storage and have > 100 food per second then remove a farmer
                requiredJobs[farmerIndex] = Math.max(state.jobs.Farmer.count - 1, 0);
                log("autoJobs", "Removing one farmer - 100 food per second")
            } else if (isHunterRace() && resources.Food.storageRatio > 0.3 && resources.Food.calculatedRateOfChange > resources.Population.currentQuantity / 10) {
                // Carnivore race. We've got some food so put them to work!
                requiredJobs[farmerIndex] = Math.max(state.jobs.Farmer.count - 1, 0);
                log("autoJobs", "Removing one farmer - Carnivore")
            } else {
                // We're good; leave farmers as they are
                requiredJobs[farmerIndex] = state.jobs.Farmer.count;
                log("autoJobs", "Leaving current farmers")
            }

            log("autoJobs", "currentQuantity " + resources.Population.currentQuantity + " breakpoint1Max " + breakpoint1Max + " requiredJobs[0] " + requiredJobs[0] + " breakpointEmployees(1) " + state.jobs.Lumberjack.breakpointEmployees(1) +  " breakpointEmployees(0) " + state.jobs.Lumberjack.breakpointEmployees(0))
            if (isEvilRace() && !isEvilUniverse()) {
                if (resources.Population.currentQuantity > breakpoint0Max && requiredJobs[farmerIndex] < state.jobs.Lumberjack.breakpointEmployees(1)) {
                    log("autoJobs", "Setting required hunters to breakpoint 1")
                    requiredJobs[farmerIndex] = state.jobs.Lumberjack.breakpointEmployees(1);
                } else if (requiredJobs[farmerIndex] < state.jobs.Lumberjack.breakpointEmployees(0)) {
                    log("autoJobs", "Setting required hunters to breakpoint 0")
                    requiredJobs[farmerIndex] = state.jobs.Lumberjack.breakpointEmployees(0);
                }
            }

            if (requiredJobs[farmerIndex] < 0) { requiredJobs[farmerIndex] = 0; }

            // Wendigo will eat any stockpiles in instant, only assign hunters if storage about to hit zero
            if ( game.global.race['ravenous'] && resources.Food.storageRatio > 0.01 ) { requiredJobs[farmerIndex] = 0; }

            jobAdjustments[farmerIndex] = requiredJobs[farmerIndex] - state.jobs.Farmer.count;
            availableEmployees -= requiredJobs[farmerIndex];
        }

        // Now assign crafters
        if (settings.autoCraftsmen){
            // Taken from game source, no idea what this "140" means.
            let speed = game.global.genes['crafty'] ? 2 : 1;
            let craft_costs = game.global.race['resourceful'] ? (1 - game.traits.resourceful.vars[0] / 100) : 1;
            let costMod = speed * craft_costs / 140;

            // Get list of craftabe resources

            let availableJobs = [];
            let demandedJobs = [];

            for (let i = 0; i < state.jobManager.craftingJobs.length; i++) {
                let job = state.jobManager.craftingJobs[i];
                // Check if we're allowed to craft this resource
                if (!job.isManaged() || !job.resource.autoCraftEnabled) {
                    continue;
                }

                // And have enough resources to craft it for at least 2 seconds
                let afforableAmount = availableCraftsmen;
                let lowestRatio = 1;
                job.resource.resourceRequirements.forEach(requirement => {
                    afforableAmount = Math.min(afforableAmount, requirement.resource.currentQuantity / (requirement.quantity * costMod) / 2);
                    lowestRatio = Math.min(lowestRatio, requirement.resource.storageRatio);
                  }
                );

                if (afforableAmount < availableCraftsmen || lowestRatio < settings.productionMinRatio){
                    continue;
                }

                //TODO: Prioritize craftables for triggers
                if (job.resource.currentQuantity < job.resource.storageRequired) {
                    demandedJobs.push(job);
                }

                availableJobs.push(job);
            }

            if (settings.productionPrioritizeDemanded && demandedJobs.length > 0) {
                availableJobs = demandedJobs;
            }

            // Sort them by amount and weight. Yes, it can be empty, not a problem.
            availableJobs.sort((a, b) => (a.resource.currentQuantity / a.resource.weighting) - (b.resource.currentQuantity / b.resource.weighting) );

            for (let i = 0; i < state.jobManager.craftingJobs.length; i++) {
                const job = state.jobManager.craftingJobs[i];
                const jobIndex = jobList.indexOf(job);

                if (jobIndex === -1) {
                    continue;
                }

                // Having empty array and undefined availableJobs[0] is fine - we still need to remove other crafters.
                if (job === availableJobs[0]){
                    jobAdjustments[jobIndex] = availableCraftsmen - job.count;
                } else {
                    jobAdjustments[jobIndex] = 0 - job.count;
                }
            }

            // We didn't assigned crafter for some reason, return employees so we can use them somewhere else
            if (availableJobs[0] === undefined){
                availableEmployees += availableCraftsmen;
            }
        }

        // And deal with the rest now
        for (let i = 0; i < state.jobManager.maxJobBreakpoints; i++) {
            for (let j = 0; j < jobList.length; j++) {
                const job = jobList[j];

                // We've already done the farmer and crafters
                if (job === state.jobs.Farmer || job.isCraftsman()) {
                    continue;
                }

                if (i !== 0) {
                    // If we're going up to the next breakpoint then add back the workers from this job from the last one
                    // so that we don't double-take them
                    availableEmployees += requiredJobs[j];
                }

                log("autoJobs", "job " + job._originalId + " job.breakpointEmployees(i) " + job.breakpointEmployees(i) + " availableEmployees " + availableEmployees);
                let jobsToAssign = Math.min(availableEmployees, job.breakpointEmployees(i));

                // Don't assign bankers if our money is maxed and bankers aren't contributing to our money storage cap
                if (job === state.jobs.Banker && !isResearchUnlocked("swiss_banking") && resources.Money.storageRatio > 0.98) {
                    jobsToAssign = 0;
                }

                // Races with the Intelligent trait get bonus production based on the number of professors and scientists
                // Only unassign them when knowledge is max if the race is not intelligent
                // Once we've research shotgun sequencing we get boost and soon autoassemble genes so stop unassigning
                if (!isIntelligentRace() && !isResearchUnlocked("shotgun_sequencing")) {
                    // Don't assign professors if our knowledge is maxed and professors aren't contributing to our temple bonus
                    if (job === state.jobs.Professor && !isResearchUnlocked("indoctrination") && resources.Knowledge.storageRatio > 0.99) {
                        jobsToAssign = 0;
                    }

                    // Don't assign scientists if our knowledge is maxed and scientists aren't contributing to our knowledge cap
                    if (job === state.jobs.Scientist && !isResearchUnlocked("scientific_journal") && resources.Knowledge.storageRatio > 0.99) {
                        jobsToAssign = 0;
                    }
                }

                if (job === state.jobs.CementWorker) {
                    let currentCementWorkers = job.count;
                    log("autoJobs", "jobsToAssign: " + jobsToAssign + ", currentCementWorkers" + currentCementWorkers + ", resources.stone.calculatedRateOfChange " + resources.Stone.calculatedRateOfChange);

                    let stoneRateOfChange = resources.Stone.calculatedRateOfChange;
                    if (game.global.race[challengeDecay]) {
                        stoneRateOfChange += resources.Stone.decayRate;
                    }

                    if (jobsToAssign < currentCementWorkers) {
                        // great, remove workers as we want less than we have
                    } else if (jobsToAssign >= currentCementWorkers && stoneRateOfChange < 5) {
                        // If we're making less than 5 stone then lets remove a cement worker even if we want more
                        jobsToAssign = job.count - 1;
                    } else if (jobsToAssign > job.count && stoneRateOfChange > 8) {
                        // If we want more cement workers and we're making more than 8 stone then add a cement worker
                        jobsToAssign = job.count + 1;
                    } else {
                        // We're not making enough stone to add a new cement worker so leave it
                        jobsToAssign = job.count;
                    }
                }

                requiredJobs[j] = jobsToAssign;
                jobAdjustments[j] = jobsToAssign - job.count;

                availableEmployees -= jobsToAssign;

                log("autoJobs", "job " + job._originalId +  " has jobsToAssign: " + jobsToAssign + ", availableEmployees: " + availableEmployees + ", availableCraftsmen: " + availableCraftsmen);
            }

            // No more workers available
            if (availableEmployees <= 0) {
                break;
            }
        }

        let splitJobs = [];
        if (lumberjackIndex !== -1) splitJobs.push( { jobIndex: lumberjackIndex, job: state.jobs.Lumberjack, weighting: settings.jobLumberWeighting, completed: false } );
        if (quarryWorkerIndex !== -1) splitJobs.push( { jobIndex: quarryWorkerIndex, job: state.jobs.QuarryWorker, weighting: settings.jobQuarryWeighting, completed: false });
        if (crystalMinerIndex !== -1) splitJobs.push( { jobIndex: crystalMinerIndex, job: state.jobs.CrystalMiner, weighting: settings.jobCrystalWeighting, completed: false });
        if (scavengerIndex !== -1) splitJobs.push( { jobIndex: scavengerIndex, job: state.jobs.Scavenger, weighting: settings.jobScavengerWeighting, completed: false });

        // Balance lumberjacks, quarry workers and scavengers if they are unlocked
        if (splitJobs.length > 0) {
            let minLumberjacks = 0;
            let totalWeighting = 0;

            if (isEvilRace() && !isEvilUniverse() && lumberjackIndex !== -1) {
                // Evil races are a little bit different. Their "umemployed" workers act as both farmers and lumberjacks
                // We need to keep a minimum number on farming.
                minLumberjacks = requiredJobs[lumberjackIndex];
            }

            // Reduce jobs required down to 0 and add them to the available employee pool so that we can split them according to weightings
            splitJobs.forEach(jobDetails => {
                availableEmployees += requiredJobs[jobDetails.jobIndex];
                requiredJobs[jobDetails.jobIndex] = 0;
                jobAdjustments[jobDetails.jobIndex] = 0 - jobDetails.job.count;
                totalWeighting += jobDetails.weighting;
            });

            // Bring them all up to breakpoint 0 one each at a time
            while (availableEmployees >= 1 && splitJobs.some(job => !job.completed)) {
                splitJobs.forEach(jobDetails => {
                    if (availableEmployees <= 0 || requiredJobs[jobDetails.jobIndex] >= jobDetails.job.breakpointEmployees(0)) {
                        jobDetails.completed = true;
                        return;
                    }

                    requiredJobs[jobDetails.jobIndex]++;
                    jobAdjustments[jobDetails.jobIndex]++;
                    availableEmployees--;
                });
            }

            // Reset completed for next breakpoint
            splitJobs.forEach(jobDetails => { jobDetails.completed = false; });

            // Bring them all up to breakpoint 1 one each at a time
            while (availableEmployees >= 1 && splitJobs.some(job => !job.completed)) {
                splitJobs.forEach(jobDetails => {
                    if (availableEmployees <= 0 || requiredJobs[jobDetails.jobIndex] >= jobDetails.job.breakpointEmployees(1)) {
                        jobDetails.completed = true;
                        return; // forEach return
                    }

                    requiredJobs[jobDetails.jobIndex]++;
                    jobAdjustments[jobDetails.jobIndex]++;
                    availableEmployees--;
                });
            }

            // splitJobs.forEach(jobDetails => {
            //     console.log("3 " + jobDetails.job.name + " required " + requiredJobs[jobDetails.jobIndex] + ", adjustment " + jobAdjustments[jobDetails.jobIndex])
            // });
            //console.log(availableEmployees)

            if (availableEmployees > 0) {
                // Split the remainder in accordance to the given weightings
                if (isEvilRace() && !isEvilUniverse() && lumberjackIndex !== -1) {
                    // Lumberjacks are special! for evil races they are also farmers so we need to keep a minimum even if the split doens't have that many
                    let lumberjacks = Math.ceil(availableEmployees * settings.jobLumberWeighting / totalWeighting);
                    lumberjacks = Math.max(minLumberjacks - requiredJobs[lumberjackIndex], lumberjacks);
                    requiredJobs[lumberjackIndex] += lumberjacks;
                    jobAdjustments[lumberjackIndex] += lumberjacks;
                    availableEmployees -= lumberjacks;
                }

                // Perform weighting - need the current available employees to multiply by the weighting
                let startingAvailableEmployees = availableEmployees;

                splitJobs.forEach(jobDetails => {
                    if (availableEmployees <= 0 || (isEvilRace() && !isEvilUniverse() && jobDetails.job === state.jobs.Lumberjack)) {
                        // We've already dealt with evil lumberjacks above. Those dastardly lumberjacks!
                        return; // forEach return
                    }

                    let workers = Math.ceil(startingAvailableEmployees * jobDetails.weighting / totalWeighting);
                    workers = Math.min(availableEmployees, workers);
                    requiredJobs[jobDetails.jobIndex] += workers;
                    jobAdjustments[jobDetails.jobIndex] += workers;
                    availableEmployees -= workers;
                });

                // Any leftovers assign to the last job
                let jobIndex = splitJobs[splitJobs.length - 1].jobIndex;
                requiredJobs[jobIndex] += availableEmployees;
                jobAdjustments[jobIndex] += availableEmployees;
                availableEmployees -= availableEmployees;
            }
        } else {
            // No lumberjacks, quarry workers or scavengers...
            if (state.jobs.Farmer.isManaged()) {
                requiredJobs[farmerIndex] += availableEmployees;
                jobAdjustments[farmerIndex] += availableEmployees;
                availableEmployees = 0;
            }
        }

        // Force default hunter job for hunter races, we'll have issues with assigning otherwise
        if (isHunterRace() && !state.jobs.Farmer.isDefault()) {
            state.jobs.Farmer.setAsDefault();
        }

        for (let i = 0; i < jobAdjustments.length; i++) {
            let adjustment = jobAdjustments[i];
            if (adjustment < 0) {
                // I have no clue how this is undefined... but it can be when the script first starts and playing a carnivore / evil race
                // May have fixed it by moving the evil race / hunter race checks to update state in the automate function
                if (jobList[i] !== undefined) {
                    jobList[i].removeWorkers(-1 * adjustment);
                    log("autoJobs", "Adjusting job " + jobList[i]._originalId + " down by " + adjustment);
                }
            }
        }

        for (let i = 0; i < jobAdjustments.length; i++) {
            let adjustment = jobAdjustments[i];
            if (adjustment > 0) {
                if (jobList[i] !== undefined) {
                    jobList[i].addWorkers(adjustment);
                    log("autoJobs", "Adjusting job " + jobList[i]._originalId + " up by " + adjustment);
                }
            }
        }

        state.lastPopulationCount = resources.Population.currentQuantity;
        state.lastFarmerCount = state.jobs.Farmer.count;

        // After reassignments adjust default job to something with workers, we need that for sacrifices.
        if (settings.jobSetDefault) {
            if (state.jobs.Farmer.isUnlocked() && state.jobs.Farmer.count > 0) {
                if (!state.jobs.Farmer.isDefault()) { state.jobs.Farmer.setAsDefault(); }
            } else if (state.jobs.QuarryWorker.isUnlocked() && state.jobs.QuarryWorker.count > 0) {
                if (!state.jobs.QuarryWorker.isDefault()) { state.jobs.QuarryWorker.setAsDefault(); }
            } else if (state.jobs.Lumberjack.isUnlocked() && state.jobs.Lumberjack.count > 0) {
                if (!state.jobs.Lumberjack.isDefault()) { state.jobs.Lumberjack.setAsDefault(); }
            } else if (state.jobs.CrystalMiner.isUnlocked() && state.jobs.CrystalMiner.count > 0) {
                if (!state.jobs.CrystalMiner.isDefault()) { state.jobs.CrystalMiner.setAsDefault(); }
            } else if (state.jobs.Scavenger.isUnlocked() && state.jobs.Scavenger.count > 0) {
                if (!state.jobs.Scavenger.isDefault()) { state.jobs.Scavenger.setAsDefault(); }
            }
        }
    }

    //#endregion Auto Jobs

    //#region Auto Tax

    function autoTax() {
        let taxVue = getVueById('tax_rates');

        if (taxVue === undefined) {
            return;
        }

        let taxInstance = game.global.civic["taxes"];
        let moraleInstance = game.global.city["morale"];

        if (!taxInstance.display || !moraleInstance) {
            return;
        }

        let currentTaxRate = taxInstance.tax_rate;
        let currentMorale = moraleInstance.current;

        let maxMorale = 100 + state.cityBuildings.Amphitheatre.count + state.cityBuildings.Casino.stateOnCount + state.spaceBuildings.HellSpaceCasino.stateOnCount
            + (state.spaceBuildings.RedVrCenter.stateOnCount * 2) + (state.spaceBuildings.Alien1Resort.stateOnCount * 2)
            + (state.projects.Monument.level * 2);

        if (game.global.tech[techSuperstar]) {
            maxMorale += state.jobs.Entertainer.count;
        }

        if (game.global.stats.achieve['joyless']){
            maxMorale += game.global.stats.achieve['joyless'].l * 2;
        }

        // Max tax rate calculation
        let extreme = game.global.tech['currency'] && game.global.tech['currency'] >= 5 ? true : false;
        let maxTaxRate = game.global.civic.govern.type === 'oligarchy' ? 50 : 30;
        if (extreme || game.global.race['terrifying']) {
            maxTaxRate += 20;
        }

        // Min tax rate calculation
        let minTaxRate = 10;

        if (extreme || game.global.race['terrifying']) {
            minTaxRate = 0;
        }

        if (minTaxRate < 20) {
            maxMorale += 10 - Math.floor(minTaxRate / 2);
        }

        // Noble race adjustments to min and max tax rate calculations - can only set tax between 10 and 20 inclusive unless in oligarchy
        let nobleMaxTaxRate = game.global.civic.govern.type === 'oligarchy' ? 40 : 20;
        if (game.global.race['noble']) {
            if (maxTaxRate > nobleMaxTaxRate) {
                maxTaxRate = nobleMaxTaxRate;
            }
            if (minTaxRate < 10) {
                minTaxRate = 10;
            }
        }

        if (resources.Money.storageRatio < 0.98) {
            minTaxRate = Math.max(minTaxRate, settings.generalMinimumTaxRate);
            maxMorale = Math.min(maxMorale, settings.generalMaximumMorale);
        }

        let optimalTax = Math.round((maxTaxRate - minTaxRate) * (1 - resources.Money.storageRatio)) + minTaxRate;

        if (currentTaxRate < maxTaxRate && currentMorale > settings.generalMinimumMorale + 1 && 
            (currentTaxRate < optimalTax || currentMorale > maxMorale + 1)) {
            taxVue.add();
        }

        if (currentTaxRate > minTaxRate && currentMorale < maxMorale && 
            (currentTaxRate > optimalTax || currentMorale < settings.generalMinimumMorale)) {
            taxVue.sub();
        }
    }

    //#endregion Auto Tax

    //#region Auto Smelter

    function autoSmelter() {
        let smelter = state.cityBuildings.Smelter;

        // No smelter; no auto smelter. No soup for you.
        if (!smelter.isUnlocked()) {
            return;
        }

        // If we don't have a cache of the smelter options then attempt to cache them
        if (!smelter.isOptionsCached()) {
            smelter.cacheOptions();
            return;
        }

        // Only adjust fuels if race does not have forge trait which means they don't require smelter fuel
        if (!isForgeRace()) {
            let fuels = smelter.managedFuelPriorityList();
            let remainingSmelters = smelter.maxOperating;
            fuels.forEach(fuel => {
                if (remainingSmelters <= 0) {
                    return;
                }

                let productionCost = fuel.productionCost;
                let resource = productionCost.resource;

                let remainingRateOfChange = resource.calculatedRateOfChange + (smelter.fueledCount(fuel.fuelIndex) * productionCost.quantity);
                // No need to preserve minimum income when storage is full
                if (resource.storageRatio < 0.98) {
                    remainingRateOfChange -= productionCost.minRateOfChange;
                }
                if (game.global.race[challengeDecay]) {
                    remainingRateOfChange += resource.decayRate;
                }
                let affordableAmount = Math.floor(remainingRateOfChange / productionCost.quantity);
                let maxAllowedUnits = Math.min(affordableAmount, remainingSmelters);
                if (maxAllowedUnits > 0) {
                    fuel.required += maxAllowedUnits;
                    remainingSmelters -= maxAllowedUnits;
                }
            });

            fuels.forEach(fuel => {
                fuel.adjustment = fuel.required - smelter.fueledCount(fuel.fuelIndex);

                if (fuel.adjustment < 0) {
                    smelter.decreaseFuel(fuel.fuelIndex, -fuel.adjustment);
                }
            });

            fuels.forEach(fuel => {
                if (fuel.adjustment > 0) {
                    smelter.increaseFuel(fuel.fuelIndex, fuel.adjustment);
                }
            });
        }

        if (game.global.race['steelen']) {
            return; // can't use the smelter in the Steelen challenge
        }

        let smelterIronCount = state.cityBuildings.Smelter.smeltingCount(SmelterSmeltingTypes.Iron);
        let smelterSteelCount = state.cityBuildings.Smelter.smeltingCount(SmelterSmeltingTypes.Steel);
        let maxAllowedSteel = state.cityBuildings.Smelter.maxOperating;

        // We only care about steel. It isn't worth doing a full generic calculation here
        // Just assume that smelters will always be fueled so Iron smelting is unlimited
        // We want to work out the maximum steel smelters that we can have based on our resource consumption
        let steelSmeltingConsumption = state.cityBuildings.Smelter.smeltingConsumption[SmelterSmeltingTypes.Steel];
        for (let i = 0; i < steelSmeltingConsumption.length; i++) {
            let productionCost = steelSmeltingConsumption[i];
            let resource = productionCost.resource;

            let remainingRateOfChange = resource.calculatedRateOfChange + (smelterSteelCount * productionCost.quantity);
            // No need to preserve minimum income when storage is full
            if (resource.storageRatio < 0.98) {
                remainingRateOfChange -= productionCost.minRateOfChange;
            }
            if (game.global.race[challengeDecay]) {
                remainingRateOfChange += resource.decayRate;
            }
            let affordableAmount = Math.floor(remainingRateOfChange / productionCost.quantity);
            maxAllowedSteel = Math.min(maxAllowedSteel, affordableAmount);
        }

        let ironTicksToFull = resources.Iron.timeToFull;
        let steelTicksToFull = resources.Steel.timeToFull;

        // We have more steel than we can afford OR iron income is too low
        if (smelterSteelCount > maxAllowedSteel || smelterSteelCount > 0 && ironTicksToFull > steelTicksToFull) {
            state.cityBuildings.Smelter.increaseSmelting(SmelterSmeltingTypes.Iron, 1);
        }

        // We can afford more steel AND either steel income is too low OR both steel and iron full, but we can use steel smelters to increase titanium income
        if (smelterSteelCount < maxAllowedSteel && smelterIronCount > 0 &&
              (steelTicksToFull > ironTicksToFull) ||
              (steelTicksToFull === 0 && ironTicksToFull === 0 && isResearchUnlocked("hunter_process") && resources.Titanium.timeToFull > 0)) {
            state.cityBuildings.Smelter.increaseSmelting(SmelterSmeltingTypes.Steel, 1);
        }

        // It's possible to also remove steel smelters when when we have nothing to produce, to save some coal
        // Or even disable them completely. But it doesn't worth it. Let it stay as it is, without jerking around
    }

    //#endregion Auto Smelter

    //#region Auto Factory

    function autoFactory() {
        let factory = state.cityBuildings.Factory;

        // No factory; no auto factory
        if (!factory.isUnlocked()) {
            return;
        }

        // If we don't have a cache of the factory options then attempt to cache them
        if (!factory.isOptionsCached()) {
            factory.cacheOptions();
            return;
        }

        let allProduction = factory.productionOptions;
        let remainingFactories = state.cityBuildings.Factory.maxOperating;

        while (remainingFactories > 0 && allProduction.some(production => !production.completed)) {
            let maxOperatingFactories = remainingFactories;
            let totalWeight = allProduction.reduce((sum, production) => sum + (production.completed ? 0 : production.weighting), 0);

            for (let i = 0; i < allProduction.length; i++) {
                const production = allProduction[i];

                if (production.completed) {
                    continue;
                }

                let calculatedRequiredFactories = Math.min(remainingFactories, Math.ceil(maxOperatingFactories / totalWeight * production.weighting));
                let actualRequiredFactories = calculatedRequiredFactories;
                if (production.resource.storageRatio > 0.99) {
                    actualRequiredFactories = 0;
                }
                let productionCosts = state.cityBuildings.Factory.productionCosts(production.goods);

                productionCosts.forEach(resourceCost => {
                    if (!resourceCost.resource.isUnlocked()) {
                        return;
                    }
                    let previousCost = state.cityBuildings.Factory.currentProduction(production.goods) * resourceCost.quantity;
                    let currentCost = production.requiredFactories * resourceCost.quantity;
                    let rate = resourceCost.resource.calculatedRateOfChange + previousCost - currentCost;
                    if (resourceCost.resource.storageRatio < 0.98) {
                        rate -= resourceCost.minRateOfChange;
                    }
                    if (game.global.race[challengeDecay]) {
                        rate += resourceCost.resource.decayRate;
                    }

                    // If we can't afford it (it's above our minimum rate of change) then remove a factory
                    // UNLESS we've got over 80% storage full. In that case lets go wild!
                    if (resourceCost.resource.storageRatio < 0.8){
                        let affordableAmount = Math.floor(rate / resourceCost.quantity);
                        actualRequiredFactories = Math.min(actualRequiredFactories, affordableAmount);
                    }
                });

                // If we're going for bioseed - try to balance neutronium\nanotubes ratio
                if (settings.prestigeBioseedConstruct && production.goods === FactoryGoods.NanoTube && resources.Neutronium.currentQuantity < 250) {
                    actualRequiredFactories = 0;
                }

                if (actualRequiredFactories > 0){
                    remainingFactories -= actualRequiredFactories;
                    production.requiredFactories += actualRequiredFactories;
                }

                // We assigned less than wanted, i.e. we either don't need this product, or can't afford it. In both cases - we're done with it.
                if (actualRequiredFactories < calculatedRequiredFactories) {
                    production.completed = true;
                }
            }
        }

        // If we have any remaining factories and the user wants to allocate unallocated factories to money then do it
        if (settings.productionMoneyIfOnly && remainingFactories > 0) {
            let luxuryGoods = allProduction.find(production => production.goods === FactoryGoods.LuxuryGoods);
            if (luxuryGoods.resource.storageRatio < 0.99) {
                let actualRequiredFactories = remainingFactories;
                let productionCosts = state.cityBuildings.Factory.productionCosts(FactoryGoods.LuxuryGoods);

                productionCosts.forEach(resourceCost => {
                    let previousCost = state.cityBuildings.Factory.currentProduction(luxuryGoods.goods) * resourceCost.quantity;
                    let currentCost = luxuryGoods.requiredFactories * resourceCost.quantity;
                    let rate = resourceCost.resource.calculatedRateOfChange + previousCost - currentCost;
                    if (resourceCost.resource.storageRatio < 0.98) {
                        rate -= resourceCost.minRateOfChange;
                    }
                    if (game.global.race[challengeDecay]) {
                        rate += resourceCost.resource.decayRate;
                    }
                    // If we can't afford it (it's above our minimum rate of change) then remove a factory
                    // UNLESS we've got over 80% storage full. In that case lets go wild!
                    if (resourceCost.resource.storageRatio < 0.8){
                        let affordableAmount = Math.floor(rate / resourceCost.quantity);
                        actualRequiredFactories = Math.min(actualRequiredFactories, affordableAmount);
                    }
                });

                luxuryGoods.requiredFactories += actualRequiredFactories;
            }
        }

        // First decrease any production so that we have room to increase others
        for (let i = 0; i < allProduction.length; i++) {
            let production = allProduction[i];
            production.factoryAdjustment = production.requiredFactories - state.cityBuildings.Factory.currentProduction(production.goods);

            if (production.factoryAdjustment < 0) { state.cityBuildings.Factory.decreaseProduction(production.goods, production.factoryAdjustment * -1) }
        }

        // Increase any production required (if they are 0 then don't do anything with them)
        for (let i = 0; i < allProduction.length; i++) {
            let production = allProduction[i];

            if (production.factoryAdjustment > 0) { state.cityBuildings.Factory.increaseProduction(production.goods, production.factoryAdjustment) }
        }
    }

    //#endregion Auto Factory

    //#region Auto Mining Droid

    function autoMiningDroid() {
        let droid = state.spaceBuildings.AlphaMiningDroid;

        // If not unlocked then nothing to do
        if (!droid.isUnlocked()) {
            return;
        }

        // If we don't have a cache of the options then attempt to cache them
        if (!droid.isOptionsCached()) {
            droid.cacheOptions();
            return;
        }

        // We've already got our cached values so just check if there is any need to change our ratios
        // We're not changing any existing setup, just allocating any free to adamantite
        // There aren't any settings around this currently
        let deltaAdamantite = droid.maxOperating - droid.currentOperating;
        droid.increaseProduction(MiningDroidGoods.Adamantite, deltaAdamantite);
    }

    //#endregion Auto Mining Droid

    //#region Auto Graphene Plant

    function autoGraphenePlant() {
        let plant = state.spaceBuildings.AlphaFactory;

        // If not unlocked then nothing to do
        if (!plant.isUnlocked()) {
            return;
        }

        // If we don't have a cache of the options then attempt to cache them
        if (!plant.isOptionsCached()) {
            plant.cacheOptions();
            return;
        }

        // We've already got our cached values so just check if there is any need to change our ratios
        let remainingPlants = plant.stateOnCount;

        let sortedFuel = plant.grapheheConsumption.slice().sort((a, b) => b.resource.storageRatio - a.resource.storageRatio);
        for (let i = 0; i < sortedFuel.length; i++) {
            const consumption = sortedFuel[i];
            const fuelIndex = plant.grapheheConsumption.indexOf(consumption);

            if (remainingPlants === 0) {
                return;
            }

            let currentFuelCount = plant.fueledCount(fuelIndex);
            let rateOfChange = consumption.resource.calculatedRateOfChange + (consumption.quantity * currentFuelCount);
            if (consumption.resource.storageRatio < 0.98) {
                rateOfChange -= consumption.minRateOfChange;
            }
            if (game.global.race[challengeDecay]) {
                rateOfChange += consumption.resource.decayRate;
            }

            let maxFueledForConsumption = remainingPlants;
            if (consumption.resource.storageRatio < 0.8){
                let affordableAmount = Math.floor(rateOfChange / consumption.quantity);
                maxFueledForConsumption = Math.max(Math.min(maxFueledForConsumption, affordableAmount), 0);
            }

            // Only produce graphene above cap if there's working BlackholeMassEjector, otherwise there's no use for excesses for sure.
            if (resources.Graphene.storageRatio > 0.99 && state.spaceBuildings.BlackholeMassEjector.stateOnCount <= 0) {
                maxFueledForConsumption = 0;
            }

            if (maxFueledForConsumption != currentFuelCount) {
                let delta = maxFueledForConsumption - currentFuelCount;
                plant.increaseFuel(fuelIndex, delta);
            }

            remainingPlants -= plant.fueledCount(fuelIndex);
        }
    }

    //#endregion Auto Graphene Plant

    //#region Mass Ejector

    /** @type { { resource: Resource, requirement: number }[] } */
    var resourcesByAtomicMass = [];

    function autoMassEjector() {
        if (!settings.prestigeWhiteholeEjectEnabled) { return; }
        if (state.spaceBuildings.BlackholeMassEjector.stateOnCount === 0) { return; }

        let adjustMassEjector = false;

        // Eject everything!
        if (state.spaceBuildings.BlackholeMassEjector.stateOnCount >= settings.prestigeWhiteholeEjectAllCount) {
            let remaining = state.spaceBuildings.BlackholeMassEjector.stateOnCount * 1000;
            adjustMassEjector = true;

            resourcesByAtomicMass.forEach(resourceRequirement => {
                let resource = resourceRequirement.resource;
                let roundedRateOfChange = Math.floor(resource.calculatedRateOfChange) - game.global.interstellar.mass_ejector[resource.id];

                if (remaining <= 0) {
                    resourceRequirement.requirement = 0;
                    return;
                }

                // These are from the autoBuildingPriority(). If we reduce below these figures then buildings start being turned off...
                // Leave enough neutronium to stabilise the blackhole if required
                let allowedRatio = 0.06;
                if (resource === resources.Food) { allowedRatio = 0.11; }
                if (resource === resources.Uranium) { allowedRatio = 0.2; } // Uranium powers buildings which add to storage cap (proxima transfer station) so this flickers if it gets too low
                if (resource === resources.Neutronium) { Math.max(allowedRatio, (techIds["tech-stabilize_blackhole"].resourceCost(resource.id) / resource.maxQuantity) + 0.01); }

                if (resource.storageRatio > allowedRatio) {
                    let allowedQuantity = allowedRatio * resource.maxQuantity;

                    // If we've got greater than X% left then eject away!
                    if (allowedQuantity > remaining) {
                        // Our current quantity is greater than our remining ejection capability so just eject what we can
                        resourceRequirement.requirement = remaining;
                    } else {
                        resourceRequirement.requirement = allowedQuantity;
                    }
                } else {
                    if ((resource === resources.Food || resource === resources.Uranium || resource === resources.Neutronium)
                            && resource.currentQuantity / resource.maxQuantity < allowedRatio - 0.01) {
                        resourceRequirement.requirement = 0
                    } else if (resource.storageRatio > 0.01 && roundedRateOfChange === 0) {
                        resourceRequirement.requirement = game.global.interstellar.mass_ejector[resource.id];
                    } else if (resource.storageRatio > 0.01 && roundedRateOfChange < 0) {
                        resourceRequirement.requirement = Math.max(0, game.global.interstellar.mass_ejector[resource.id] + roundedRateOfChange);
                    } else if (resource.storageRatio > 0.01 && roundedRateOfChange > 0) {
                        resourceRequirement.requirement = Math.min(remaining, game.global.interstellar.mass_ejector[resource.id] + roundedRateOfChange);
                    } else {
                        resourceRequirement.requirement = 0;
                    }
                }

                remaining -= resourceRequirement.requirement;
            });
        }

        // Only eject if storage cap reached for resource
        if (state.spaceBuildings.BlackholeMassEjector.stateOnCount < settings.prestigeWhiteholeEjectAllCount) {
            let remaining = state.spaceBuildings.BlackholeMassEjector.stateOnCount * 1000;
            adjustMassEjector = true;

            resourcesByAtomicMass.forEach(resourceRequirement => {
                let resource = resourceRequirement.resource;
                let ejectableAmount = Math.ceil(resource.calculatedRateOfChange);

                if (remaining <= 0) {
                    resourceRequirement.requirement = 0;
                    return;
                }

                if (resource.storageRatio < 0.98) {
                    // Decay is tricky. We want to start ejecting as soon as possible... but won't have full storages here. Let's eject x% of decayed amount, unless we're buying it, or it's Adamantite(we need it to get more ejectors).
                    if (game.global.race[challengeDecay] && resource.currentTradeRoutes <= 0 && resource !== resources.Adamantite) {
                        ejectableAmount = Math.floor(resource.decayRate * settings.prestigeWhiteholeDecayRate);
                    } else {
                        ejectableAmount = 0;
                    }
                }

                resourceRequirement.requirement = Math.min(remaining, Math.max(0, ejectableAmount));
                remaining -= resourceRequirement.requirement;
            });
        }

        if (!adjustMassEjector) { return; }

        // Decrement first to free up space
        resourcesByAtomicMass.forEach(resourceRequirement => {
            let resource = resourceRequirement.resource;
            let adjustment = resourceRequirement.requirement - game.global.interstellar.mass_ejector[resource.id];
            if (adjustment < 0) {
                resource.decreaseEjection(adjustment * -1);
            }
        });

        // Increment any remaining items
        resourcesByAtomicMass.forEach(resourceRequirement => {
            let resource = resourceRequirement.resource;
            let adjustment = resourceRequirement.requirement - game.global.interstellar.mass_ejector[resource.id];
            if (adjustment > 0) {
                resource.increaseEjection(adjustment);
            }
        });
    }

    //#endregion Mass Ejector

    //#region Auto Whitehole

    function autoWhiteholePrestige() {
        if (!isWhiteholePrestigeAvailable()) {return; } // Solar mass requirements met and research available

        let tech = techIds["tech-infusion_confirm"];
        if (tech.isUnlocked()) { tech.click(); }

        tech = techIds["tech-infusion_check"];
        if (tech.isUnlocked()) { tech.click(); }

        tech = techIds["tech-exotic_infusion"];
        if (tech.isUnlocked()) { tech.click(); }
    }

    function isWhiteholePrestigeAvailable() {
        if (getBlackholeMass() < settings.prestigeWhiteholeMinMass) { return false;}
        if (!techIds["tech-exotic_infusion"].isUnlocked() && !techIds["tech-infusion_check"].isUnlocked() && !techIds["tech-infusion_confirm"].isUnlocked()) { return false; }

        return true;
    }

    function getBlackholeMass() {
        if (!game.global['interstellar'] || !game.global.interstellar['stellar_engine'] || !game.global.interstellar.stellar_engine['mass'] || !game.global.interstellar.stellar_engine['exotic']) { return 0 };
        return +(game.global.interstellar.stellar_engine.mass + game.global.interstellar.stellar_engine.exotic).toFixed(10);
    }

    //#endregion Auto Whitehole

    //#region Auto MAD

    function autoMadPrestige() {
        // Don't MAD if it isn't unlocked
        if (!isResearchUnlocked("mad") || document.getElementById("mad").style.display === "none") {
            return;
        }

        if (!resources.Population.isUnlocked()) {
            return;
        }

        // Can't kill ourselves if we don't have nukes yet...
        let armMissilesBtn = document.querySelector('#mad button.arm');
        if (state.goal !== "PreparingMAD" && armMissilesBtn === null) {
            return;
        }

        let launchMissilesBtn = document.querySelector('#mad > div > div:nth-child(3) .button');

        if (state.goal !== "PreparingMAD" || (state.goal === "PreparingMAD" && launchMissilesBtn["disabled"])) {
            logClick(armMissilesBtn, "arm missiles");
            state.goal = "PreparingMAD";
            return; // Give the UI time to update
        }

        if (state.warManager.currentSoldiers === state.warManager.maxSoldiers && resources.Population.currentQuantity === resources.Population.maxQuantity) {
            // Push... the button
            console.log("Soft resetting game with MAD");
            state.goal = "GameOverMan";
            logClick(launchMissilesBtn, "launch missiles");
        }
    }

    //#endregion Auto MAD

    //#region Auto Seeder Ship

    function autoSeederPrestige() {
        if (!isBioseederPrestigeAvailable()) { return; } // ship completed and probe requirements met

        if (state.spaceBuildings.GasSpaceDockLaunch.isUnlocked()) {
            console.log("Soft resetting game with BioSeeder ship");
            state.goal = "GameOverMan";
            state.spaceBuildings.GasSpaceDockLaunch.click(1);
        } else if (state.spaceBuildings.GasSpaceDockPrepForLaunch.isUnlocked()) {
            state.spaceBuildings.GasSpaceDockPrepForLaunch.click(1);
        } else {
            // Open the modal to update the options
            state.spaceBuildings.GasSpaceDock.cacheOptions();
        }

    }

    function isBioseederPrestigeAvailable() {
        let spaceDock = state.spaceBuildings.GasSpaceDock;
        if (!spaceDock.isUnlocked) { return false; }
        if (spaceDock.count < 1) { return false; }
        if (state.spaceBuildings.GasSpaceDockShipSegment.count < 100) { return false; }
        if (state.spaceBuildings.GasSpaceDockProbe.count < settings.prestigeBioseedProbes) { return false; }

        return true;
    }

    //#endregion Auto Seeder Ship

    //#region Auto Assemble Gene

    function autoAssembleGene() {
        if (!settings.genesAssembleGeneAlways && isResearchUnlocked("dna_sequencer")) {
            return;
        }

        // If we haven't got the assemble gene button or don't have full knowledge then return
        if (game.global.tech["genetics"] < 6 || resources.Knowledge.storageRatio < 0.99) {
            return;
        }

        let vue = getVueById("arpaSequence");
        if (vue !== undefined) {
            vue.novo();
        }
    }

    //#endregion Auto Assemble Gene

    //#region Auto Market

    /**
     * @param {boolean} [bulkSell]
     * @param {boolean} [ignoreSellRatio]
     */
    function autoMarket(bulkSell, ignoreSellRatio) {
        let m = state.marketManager;

        // Market has not been unlocked in game yet (tech not researched)
        if (!m.isUnlocked()) {
            return;
        }
        adjustTradeRoutes();

        // Manual trade disabled
        if (game.global.race['no_trade']) {
            return;
        }

        let currentMultiplier = m.getMultiplier(); // Save the current multiplier so we can reset it at the end of the function
        let maxMultiplier = m.getMaxMultiplier();

        for (let i = 0; i < m.priorityList.length; i++) {
            let resource = m.priorityList[i];

            if (!resource.isTradable() || !resource.isUnlocked() || !m.isBuySellUnlocked(resource)) {
                continue;
            }

            if ((resource.autoSellEnabled && (ignoreSellRatio || resource.storageRatio > resource.autoSellRatio)) || resource.storageRatio === 1) {
                let maxAllowedTotalSellPrice = resources.Money.maxQuantity - resources.Money.currentQuantity;
                let unitSellPrice = m.getUnitSellPrice(resource);
                let maxAllowedUnits = Math.floor(maxAllowedTotalSellPrice / unitSellPrice); // only sell up to our maximum money

                if (resource.storageRatio > resource.autoSellRatio) {
                    maxAllowedUnits = Math.min(maxAllowedUnits, Math.floor(resource.currentQuantity - (resource.autoSellRatio * resource.maxQuantity))); // If not full sell up to our sell ratio
                } else {
                    maxAllowedUnits = Math.min(maxAllowedUnits, Math.floor(resource.calculatedRateOfChange * 2)); // If resource is full then sell up to 2 seconds worth of production
                }

                if (maxAllowedUnits <= maxMultiplier) {
                    // Our current max multiplier covers the full amount that we want to sell
                    m.setMultiplier(maxAllowedUnits);
                    m.sell(resource)
                } else {
                    // Our current max multiplier doesn't cover the full amount that we want to sell. Sell up to 5 batches.
                    let counter = Math.min(5, Math.floor(maxAllowedUnits / maxMultiplier)); // Allow up to 5 sales per script loop
                    m.setMultiplier(maxMultiplier);

                    for (let j = 0; j < counter; j++) {
                        m.sell(resource);
                    }
                }
            }

            if (bulkSell === true) {
                continue;
            }

            if (resource.autoBuyEnabled === true && resource.storageRatio < resource.autoBuyRatio) {
                let storableAmount = Math.floor((resource.autoBuyRatio - resource.storageRatio) * resource.maxQuantity);
                let affordableAmount = Math.floor((resources.Money.currentQuantity - state.minimumMoneyAllowed) / m.getUnitBuyPrice(resource));
                let maxAllowedUnits = Math.min(storableAmount, affordableAmount);
                if (maxAllowedUnits > 0) {
                    if (maxAllowedUnits <= maxMultiplier){
                        m.setMultiplier(maxAllowedUnits);
                        m.buy(resource);
                    } else {
                        let counter = Math.min(5, Math.floor(maxAllowedUnits / maxMultiplier));
                        m.setMultiplier(maxMultiplier);

                        for (let j = 0; j < counter; j++) {
                            m.buy(resource);
                        }
                    }
                }
            }
        }

        m.setMultiplier(currentMultiplier); // Reset multiplier
    }

    //#endregion Auto Market

    //#region Auto Building

    function getResourcesPerClick() {
      let amount = 1;
      if (game.global.race['strong']) {
        amount *= game.traits.strong.vars[0];
      }
      if (game.global.genes['enhance']) {
        amount *= 2;
      }
      return amount;
    }

    function autoGatherResources() {
        // Don't spam click once we've got a bit of population going
        if (!settings.buildingAlwaysClick && resources.Population.currentQuantity > 15) {
            if (!state.cityBuildings.RockQuarry.isUnlocked()) {
                return;
            }

            if (state.cityBuildings.RockQuarry.count > 0) {
                return;
            }
        }

        //Uses exposed action handlers, bypassing vue - they much faster, and that's important with a lot of calls
        //Clicks only up to full storage, but calculatedRateOfChange increased by full amount, so script will know exact number of surplus
        let resPerClick = getResourcesPerClick();
        if (state.cityBuildings.Food.isClickable()){
           let amount = Math.min((resources.Food.maxQuantity - resources.Food.currentQuantity) / resPerClick, settings.buildingClickPerTick);
           let food = game.actions.city.food;
           for (var i = 0; i < amount; i++) {
             food.action();
           }
           resources.Food.calculatedRateOfChange += resPerClick * settings.buildingClickPerTick;
        }
        if (state.cityBuildings.Lumber.isClickable()){
           let amount = Math.min((resources.Lumber.maxQuantity - resources.Lumber.currentQuantity) / resPerClick, settings.buildingClickPerTick);
           let lumber = game.actions.city.lumber;
           for (var i = 0; i < amount; i++) {
             lumber.action();
           }
           resources.Lumber.calculatedRateOfChange += resPerClick * settings.buildingClickPerTick;
        }
        if (state.cityBuildings.Stone.isClickable()){
           let amount = Math.min((resources.Stone.maxQuantity - resources.Stone.currentQuantity) / resPerClick, settings.buildingClickPerTick);
           let stone = game.actions.city.stone;
           for (var i = 0; i < amount; i++) {
             stone.action();
           }
           resources.Stone.calculatedRateOfChange += resPerClick * settings.buildingClickPerTick;
        }
        if (state.cityBuildings.Slaughter.isClickable()){
           let amount = Math.min(Math.max(resources.Lumber.maxQuantity - resources.Lumber.currentQuantity, resources.Food.maxQuantity - resources.Food.currentQuantity, resources.Furs.maxQuantity - resources.Furs.currentQuantity) / resPerClick, settings.buildingClickPerTick);
           let slaughter = game.actions.city.slaughter;
           for (var i = 0; i < amount; i++) {
             slaughter.action();
           }
           resources.Lumber.calculatedRateOfChange += resPerClick * settings.buildingClickPerTick;
           resources.Food.calculatedRateOfChange += resPerClick * settings.buildingClickPerTick;
           resources.Furs.calculatedRateOfChange += resPerClick * settings.buildingClickPerTick;
        }
    }

    function autoBuild() {
        // Space dock is special and has a modal window with more buildings!
        if (!state.spaceBuildings.GasSpaceDock.isOptionsCached()) {
            if (state.spaceBuildings.GasSpaceDock.cacheOptions()) {
                return;
            }
        }

        // Check for active build triggers
        for (let i = 0; i < state.triggerManager.targetTriggers.length; i++) {
            const trigger = state.triggerManager.targetTriggers[i];
            if (trigger.actionType === "build") {
                const building = buildingIds[trigger.actionId];

                // We don't care about autoBuild settings, weight, amount, etc - trigger overrides everything if we have a trigger, and can build - do it.
                if (building.isClickable()) {
                    building.click(1);
                    if (building._tab === "space" || building._tab === "interstellar" || building._tab === "portal") {
                        removePoppers();
                    }
                    return;
                }
            }
        }

        let buildingList = state.buildingManager.managedPriorityList();

        // Sort array so we'll have prioritized buildings on top. We'll need that below to avoid deathlocks, when building 1 waits for building 2, and building 2 waits for building 3. That's something we don't want to happen when building 1 and building 3 doesn't conflicts with each other.
        buildingList.sort((a, b) => b.weighting - a.weighting);

        let estimatedTime = [];

        // Loop through the auto build list and try to buy them
        buildingsLoop:
        for (let i = 0; i < buildingList.length; i++) {
            const building = buildingList[i];

            // Only go further if we can build it right now
            if (!game.checkAffordable(building.definition, false)) {
                building.extraDescription += "Not enough resources<br>";
                continue;
            }

            // Checks weights, if this building doesn't demands any overflowing resources(unless we ignoring overflowing)
            if (!settings.buildingBuildIfStorageFull || !building.resourceRequirements.some(requirement => requirement.resource.storageRatio > 0.98)) {
              for (let j = 0; j < buildingList.length; j++) {
                let other = buildingList[j];

                // We only care about buildings with highter weight
                // And we don't want to process clickable buildings - list was sorted by weight, and all buildings with highter priority should already been proccessed.
                // If that thing is affordable, but wasn't bought - it means something block it, and it won't be builded soon anyway, so we'll ignore it's demands.
                if (building.weighting >= other.weighting || game.checkAffordable(other.definition, false)){
                    continue;
                }
                let weightDiffRatio = other.weighting / building.weighting;

                // Calculate time to build for competing building, if it's not cached
                if (!estimatedTime[other.id]){
                    estimatedTime[other.id] = [];
                    estimatedTime[other.id].total = 0;

                    for (let k = 0; k < other.resourceRequirements.length; k++) {
                        let resource = other.resourceRequirements[k].resource;
                        let quantity = other.resourceRequirements[k].quantity;

                        // Ignore locked
                        if (!resource.isUnlocked()) {
                            continue;
                        }

                        // Bought resources are not included in calculatedRateOfCharge, to prevent overusing them, but here they will make estimations more accurate with no negative consequences. That's the very reason why we're buying any resources after all - to construct things sooner.
                        let totalRateOfCharge = resource.calculatedRateOfChange + (resource.currentTradeRoutes > 0 ? game.breakdown.p.consume[resource.id].Trade : 0);
                        if (totalRateOfCharge <= 0) {
                            // Craftables and such, which not producing at this moment. We can't realistically calculate how much time it'll take to fulfil requirement(too many factors), so let's assume we can get it any any moment.
                            estimatedTime[other.id][resource.id] = 0;
                        } else {
                            estimatedTime[other.id][resource.id] = (quantity - resource.currentQuantity) / totalRateOfCharge;
                        }
                        estimatedTime[other.id].total = Math.max(estimatedTime[other.id].total, estimatedTime[other.id][resource.id]);
                    }
                }

                // Compare resource costs
                for (let k = 0; k < building.resourceRequirements.length; k++) {
                  let thisRequirement = building.resourceRequirements[k];
                  let resource = thisRequirement.resource;

                  // Ignore locked and capped resources
                  if (!resource.isUnlocked() || resource.storageRatio > 0.98){
                      continue;
                  }

                  // Check if we're actually conflicting on this resource
                  let otherRequirement = other.resourceRequirements.find(resourceRequirement => resourceRequirement.resource === resource);
                  if (otherRequirement === undefined){
                      continue;
                  }

                  // We have enought resources for both buildings, no need to preserve it
                  if (resource.currentQuantity > (otherRequirement.quantity + thisRequirement.quantity)) {
                      continue;
                  }

                  // We can use up to this amount of resources without delaying competing building
                  // Not very accurate, as income can fluctuate wildly for foundry, factory, and such, but should work as bottom line
                  let totalRateOfCharge = resource.calculatedRateOfChange + (resource.currentTradeRoutes > 0 ? game.breakdown.p.consume[resource.id].Trade : 0);
                  let spareAmount = (estimatedTime[other.id].total - estimatedTime[other.id][resource.id]) * totalRateOfCharge;
                  if (thisRequirement.quantity <= spareAmount) {
                      continue;
                  }

                  // Check if cost difference is below weighting threshold, so we won't wait hours for 10x amount of resources when weight is just twice higher
                  let costDiffRatio = otherRequirement.quantity / thisRequirement.quantity;
                  if (costDiffRatio >= weightDiffRatio) {
                      continue;
                  }

                  // If we reached here - then we want to delay with our current building. Return all way back to main loop, and try to build something else
                  building.extraDescription += `Conflicts with ${other.name} for ${resource.name}<br>`;
                  continue buildingsLoop;
                }
              }
            }

            // Build building
            if (building.click(1)) {
                if (building._tab === "space" || building._tab === "interstellar" || building._tab === "portal") {
                    removePoppers();
                }
                break;
            }
        }

        $('.popper').each(function(){
          let building = buildingIds[this.id.substr(3)];
          if (building) {
            let desc_node = $(this).find("#extra_desc");
            if (desc_node.length){
              desc_node.html(building.extraDescription);
            } else {
              $(this).css("pointer-events", "none");
              $(this).append(`<div id="extra_desc">${building.extraDescription}</div>`);
            }
          }
        });
    }

    //#endregion Auto Building

    //#region Auto Research

    function autoResearch() {
        let items = $('#tech .action').not('.cna');

        // Check if we have something researchable
        if (items.length === 0){
            return;
        }

        // Check for active research triggers
        let targetResearch = [];
        for (let i = 0; i < state.triggerManager.targetTriggers.length; i++) {
            const trigger = state.triggerManager.targetTriggers[i];

            if (trigger.actionType === "research") {
                const techId = tech[trigger.actionId].definition.id;
                if (items.filter("#" + techId).length > 0){
                  targetResearch.push(techId);
                }
            }
        }

        for (let i = 0; i < items.length; i++) {
            const itemId = items[i].id;
            let click = false;

            // Block research that conflics with active triggers, but never block research that is wanted by an active trigger
            // @ts-ignore
            if (!targetResearch.includes(itemId) && state.triggerManager.researchConflicts(techIds[itemId])) {
                continue;
            }

            // Whitehole researches
            if (itemId === "tech-stabilize_blackhole" && settings.prestigeWhiteholeStabiliseMass && getBlackholeMass() < settings.prestigeWhiteholeMinMass) {
                // If user wants to stabilise blackhole when under minimum solar mass then do it
                click = true;
            } else if (itemId === "tech-exotic_infusion" || itemId === "tech-infusion_check" || itemId === "tech-infusion_confirm" || itemId === "tech-stabilize_blackhole"
                || itemId === "tech-dial_it_to_11" || itemId === "tech-limit_collider") {
                // Don't click any of the whitehole / cataclysm reset options without user consent... that would be a dick move, man.
                continue;
            }

            if (itemId !== "tech-anthropology" && itemId !== "tech-fanaticism" && itemId !== "tech-unification2"
                && itemId !== "tech-study" && itemId !== "tech-deify") {
                    click = true;
            } else {
                if (itemId === settings.userResearchTheology_1) {
                    // use the user's override choice
                    log("autoResearch", "Picking user's choice of theology 1: " + itemId);
                    click = true;
                }

                if (settings.userResearchTheology_1 === "auto") {
                    if (settings.prestigeType === "mad" && itemId === "tech-anthropology") {
                        // If we're not going to space then research anthropology
                        log("autoResearch", "Picking: " + itemId);
                        click = true;
                    }
                    if (settings.prestigeType !== "mad" && itemId === "tech-fanaticism") {
                        // If we're going to space then research fanaticism
                        log("autoResearch", "Picking: " + itemId);
                        click = true;
                    }
                }

                if (itemId === settings.userResearchTheology_2) {
                    // use the user's override choice
                    log("autoResearch", "Picking user's choice of theology 2: " + itemId);
                    click = true;
                }

                if (settings.userResearchTheology_2 === "auto") {
                    if (itemId === "tech-deify") {
                        // Just pick deify for now
                        log("autoResearch", "Picking: " + itemId);
                        click = true;
                    }
                }

                // Hey, we can get both theology researches
                if (itemId === "tech-anthropology" && isResearchUnlocked("fanaticism")) {
                    click = true;
                }
                if (itemId === "tech-fanaticism" && isResearchUnlocked("anthropology")) {
                    click = true;
                }

                // Unify, if allowed
                if (itemId === "tech-unification2" && settings.foreignUnification) {
                    click = true;
                }
            }

            if (click && techIds[itemId].click()) {
                // The unification techs are special as they are always "clickable" even if they can't be afforded.
                // We don't want to continually remove the poppers if the script is clicking one every second that
                // it can't afford
                removePoppers();
                return;
            }
        }
    }

    /**
     * @param {string} unificationTechId
     */
    function isUnificationPossible(unificationTechId) {
        if (unificationTechId === "tech-wc_reject") {
            // We can always reject unity
            return true;
        } else if (unificationTechId === "tech-wc_money") {
            return resources.Money.currentQuantity >= techIds[unificationTechId].definition.cost.Money();
        } else if (unificationTechId === "tech-wc_morale") {
            let moraleInstance = game.global.city["morale"];
            if (!moraleInstance) { return false; }
            return moraleInstance.current >= techIds[unificationTechId].definition.cost.Morale();
        } else if (unificationTechId === "tech-wc_conquest") {
            return techIds[unificationTechId].definition.cost.Army();
        }
    }

    //#endregion Auto Research

    //#region Auto ARPA

    function autoArpa() {
        let projectList = state.projectManager.managedPriorityList();

        // Special autoSpace logic. If autoSpace is on then ignore other ARPA settings and build once MAD has been researched
        if (settings.autoSpace && state.projects.LaunchFacility.isUnlocked() && isResearchUnlocked("mad")) {
            if (!state.triggerManager.projectConflicts(state.projects.LaunchFacility)) {
                log("autoARPA", "override build launch facility")
                state.projects.LaunchFacility.tryBuild(false);
            }
        }

        // Loop through our managed projects
        for (let i = 0; i < projectList.length; i++) {
            const project = projectList[i];

            // Only level up to user defined max
            if (project.level >= project.autoMax) {
                continue;
            }

            if (!state.triggerManager.projectConflicts(project)) {
                log("autoARPA", "standard build " + project.id)
                project.tryBuild(true);
            }
        }

        // ONLY IF settings allow then...
        // Loop through our unmanaged projects and build if storage if full for all resources except money
        if (!settings.arpaBuildIfStorageFull) {
            return;
        }

        projectList = state.projectManager.priorityList;

        for (let i = 0; i < projectList.length; i++) {
            const project = projectList[i];
            let allowBuild = true;

            if (project.resourceRequirements.length === 0) {
                continue;
            }

            for (let j = 0; j < project.resourceRequirements.length; j++) {
                const requirement = project.resourceRequirements[j];
                let onePercentOfRequirementQuantity = requirement.quantity / 100;

                log("autoARPA", "project " + project.id + ", resource " + requirement.resource.id + ", one percent, " + onePercentOfRequirementQuantity);

                if (onePercentOfRequirementQuantity === 0) { log("autoARPA", "continue: cost is zero"); continue; } // Monument can be made of different things. Sometimes these requirements will be zero.
                if (requirement.resource === resources.Money) { log("autoARPA", "continue: resource is money"); continue; } // Don't check if money is full. We can build if we are above our minimum money setting (which is checked in tryBuild)

                if (requirement.resource.currentQuantity < onePercentOfRequirementQuantity) {
                    log("autoARPA", "break: current < requirement");
                    allowBuild = false;
                    break;
                }

                if (!requirement.resource.isCraftable() && requirement.resource.storageRatio <= 0.98) {
                    log("autoARPA", "break: storage < 98%");
                    allowBuild = false;
                    break;
                }

                if (onePercentOfRequirementQuantity / requirement.resource.currentQuantity > (settings.arpaBuildIfStorageFullResourceMaxPercent / 100)) {
                    log("autoARPA", "break: storage ratio < setting");
                    allowBuild = false;
                    break;
                }

                if (requirement.resource.isCraftable()) {
                    let amountToKeep = (settings.arpaBuildIfStorageFullCraftableMin === -1 ? requirement.resource.storageRequired : settings.arpaBuildIfStorageFullCraftableMin);
                    if (requirement.resource.currentQuantity - onePercentOfRequirementQuantity < amountToKeep){
                        log("autoARPA", "break: craftables < setting");
                        allowBuild = false;
                        break;
                    }
                }
            }

            if (allowBuild && !state.triggerManager.projectConflicts(project)) {
                log("autoARPA", "full resources build " + project.id)
                project.tryBuild(false);
            }
        }
    }

    //#endregion Auto ARPA

    //#region Auto Power

    function autoBuildingPriority() {
        let availablePowerNode = document.querySelector('#powerMeter');

        // Only start doing this once power becomes available. Isn't useful before then
        if (availablePowerNode === null) {
            return;
        }

        let buildingList = state.buildingManager.managedStatePriorityList();

        // No buildings unlocked yet
        if (buildingList.length === 0) {
            return;
        }

        // Disable underpowered buildings
        $("span.on.warn").each(function(){
            let vue = this.parentNode.__vue__;
            if (vue && vue.power_off) {
                vue.power_off();
            }
        });

        // Calculate the available power / resource rates of change that we have to work with
        let availablePower = parseFloat(availablePowerNode.textContent);

        for (let i = 0; i < buildingList.length; i++) {
            let building = buildingList[i];

            availablePower += (building.powered * building.stateOnCount);

            for (let j = 0; j < building.consumption.resourceTypes.length; j++) {
                let resourceType = building.consumption.resourceTypes[j];

                // Fuel adjust
                if (building._tab === "space" && (resourceType.resource === resources.Oil || resourceType.resource === resources.Helium_3)) {
                    resourceType.rate = spaceFuelAdjust(resourceType.initialRate);
                }
                if (building._tab === "interstellar" && (resourceType.resource === resources.Deuterium || resourceType.resource === resources.Helium_3) && building !== state.spaceBuildings.AlphaFusion) {
                    resourceType.rate = intFuelAdjust(resourceType.initialRate);
                }

                // Just like for power, get our total resources available
                resourceType.resource.calculatedRateOfChange += resourceType.rate * building.stateOnCount;
            }
        }

        // Start assigning buildings from the top of our priority list to the bottom
        for (let i = 0; i < buildingList.length; i++) {
            let building = buildingList[i];
            let requiredStateOn = 0;

            for (let j = 0; j < building.count; j++) {
                if (building.powered > 0) {
                    // Building needs power and we don't have any
                    if ((availablePower <= 0 && building.powered > 0) || (availablePower - building.powered < 0)) {
                        continue;
                    }
                }

                if (settings.autoHell && settings.hellHandleAttractors && building === state.spaceBuildings.PortalAttractor && requiredStateOn >= state.warManager.hellAttractorMax) {
                    continue;
                }

                if (building === state.cityBuildings.TouristCenter && resources.Money.storageRatio > 0.98) {
                    requiredStateOn = Math.max(0, building.stateOnCount - 1);
                    continue;
                }

                let resourcesToTake = 0;

                for (let k = 0; k < building.consumption.resourceTypes.length; k++) {
                    let resourceType = building.consumption.resourceTypes[k];

                    // TODO: Implement minimum rates of change for each resource
                    // If resource rate is negative then we are gaining resources. So, only check if we are consuming resources
                    if (resourceType.rate > 0) {
                        let isStorageAvailable = false;

                        // If we have more than xx% of our storage then its ok to lose some resources.
                        // This check is mainly so that power producing buildings don't turn off when rate of change goes negative.
                        // That can cause massive loss of life if turning off space habitats :-)
                        // We'll turn power producing structures off one at a time below if they are below xx% storage
                        if (resourceType.resource === resources.Food) {
                            // Wendigo doesn't store food. Let's assume it's always available.
                            if (game.global.race['ravenous']) {
                                isStorageAvailable = true;
                            } else {
                                isStorageAvailable = resourceType.resource.storageRatio > 0.1;
                            }
                        } else if (resourceType.resource === resources.Coal || resourceType.resource === resources.Oil
                                || resourceType.resource === resources.Uranium || resourceType.resource === resources.Helium_3
                                || resourceType.resource === resources.Elerium || resourceType.resource === resources.Deuterium) {
                            isStorageAvailable = resourceType.resource.storageRatio > 0.01;
                        }

                        if (!isStorageAvailable) {
                            if (resourceType.resource.calculatedRateOfChange <= 0 || resourceType.resource.calculatedRateOfChange - resourceType.rate < 0) {
                                continue;
                            }
                        }
                    }

                    resourcesToTake++;
                }

                // All resources passed the test so take them.
                if (resourcesToTake === building.consumption.resourceTypes.length) {
                    availablePower -= building.powered;

                    for (let k = 0; k < building.consumption.resourceTypes.length; k++) {
                        let resourceType = building.consumption.resourceTypes[k];
                        resourceType.resource.calculatedRateOfChange -= resourceType.rate;
                    }

                    requiredStateOn++;
                } else {
                    // If this is a power producing structure then only turn off one at a time!
                    if (building.powered < 0) {
                        requiredStateOn = building.stateOnCount - 1;
                        availablePower += building.powered; // we're turning off a power producing building so remove it from available power
                    }

                    // We couldn't get the resources so skip the rest of this building type
                    break;
                }
            }

            let adjustment = requiredStateOn - building.stateOnCount;
            building.tryAdjustState(adjustment);
        }
    }

    //#endregion Auto Power

    //#region Auto Trade Specials

    function autoStorage() {
        let m = state.storageManager;

        // Containers has not been unlocked in game yet (tech not researched)
        if (!m.isUnlocked()) {
            return;
        }

        let storageList = m.managedPriorityList();
        if (storageList.length === 0) {
            return;
        }

        let crateVolume = m.getCrateVolume();
        let containerVolume = m.getContainerVolume();
        let totalCrates = resources.Crates.currentQuantity;
        let totalContainers = resources.Containers.currentQuantity;
        let storageAdjustments = [];

        // Init storageAdjustments, we need to do it saparately, as loop below can jump to the and of array
        for (var i = 0; i < storageList.length; i++){
            storageAdjustments.push({resource: storageList[i], adjustCrates: 0, adjustContainers: 0, calculatedContainers: storageList[i].currentContainers, calculatedCrates: storageList[i].currentCrates});
        }

        let totalStorageMissing = 0;

        // Calculate storages
        for (var i = 0; i < storageList.length; i++){
            let resource = storageList[i];
            let cratesStorage = storageAdjustments[i].calculatedCrates * crateVolume;
            let containersStorage = storageAdjustments[i].calculatedContainers * containerVolume;
            let extraStorage = cratesStorage + containersStorage;
            let rawStorage = resource.maxQuantity - extraStorage;
            let freeStorage = resource.maxQuantity - resource.currentQuantity;
            let extraStorageRequired = resource.storageRequired - rawStorage;

            // If we're overflowing, and want to store more - just request one more crate volume
            if (resource.storeOverflow) {
                extraStorageRequired = Math.max(extraStorageRequired, resource.currentQuantity * 1.01 - rawStorage);
            }

            // We don't need any extra storage here, and don't care about wasting, just remove everything and go to next resource
            if (!settings.storageSafeReassign && extraStorageRequired <= 0){
                totalCrates += storageAdjustments[i].calculatedCrates;
                totalContainers += storageAdjustments[i].calculatedContainers;
                storageAdjustments[i].adjustCrates -= storageAdjustments[i].calculatedCrates;
                storageAdjustments[i].adjustContainers -= storageAdjustments[i].calculatedContainers;
                continue;
            }

            // Check if have extra containers here
            if (containersStorage > 0 && ((extraStorage - containerVolume) > extraStorageRequired || storageAdjustments[i].calculatedContainers > resource.autoContainersMax)){
                let uselessContainers = Math.floor((extraStorage - extraStorageRequired) / containerVolume);
                let extraContainers = Math.min(storageAdjustments[i].calculatedContainers, uselessContainers);
                let overcapContainers = storageAdjustments[i].calculatedContainers - resource.autoContainersMax;
                let removedContainers = Math.max(overcapContainers, extraContainers);

                if (settings.storageSafeReassign || resource.storeOverflow) {
                    let emptyContainers = Math.floor(freeStorage / containerVolume);
                    removedContainers = Math.min(removedContainers, emptyContainers);
                }

                totalContainers += removedContainers;
                storageAdjustments[i].adjustContainers -= removedContainers;
                extraStorage -= removedContainers * containerVolume;
                freeStorage -= removedContainers * containerVolume;;
            }

            // Check if have extra crates here
            if (cratesStorage > 0 && ((extraStorage - crateVolume) > extraStorageRequired || storageAdjustments[i].calculatedCrates > resource.autoCratesMax)){
                let uselessCrates = Math.floor((extraStorage - extraStorageRequired) / crateVolume);
                let extraCrates = Math.min(storageAdjustments[i].calculatedCrates, uselessCrates);
                let overcapCrates = storageAdjustments[i].calculatedCrates - resource.autoCratesMax;
                let removedCrates = Math.max(overcapCrates, extraCrates);

                if (settings.storageSafeReassign || resource.storeOverflow) {
                    let emptyCrates = Math.floor(freeStorage / crateVolume);
                    removedCrates = Math.min(removedCrates, emptyCrates);
                }

                totalCrates += removedCrates;
                storageAdjustments[i].adjustCrates -= removedCrates;
                extraStorage -= removedCrates * crateVolume;
                //freeStorage -= removedCrates * crateVolume;
            }

            let missingStorage = extraStorageRequired - extraStorage;

            // Check if we're missing storage on this resource
            if (missingStorage > 0){
                let availableStorage = (totalCrates * crateVolume) + (totalContainers * containerVolume);

                // We don't have enough containers, let's try to unassign something less prioritized
                if (availableStorage < missingStorage){
                    for (var j = storageList.length-1; j > i; j--){
                        let otherFreeStorage = storageList[j].maxQuantity - storageList[j].currentQuantity;

                        // Unassign crates
                        if (storageAdjustments[j].calculatedCrates > 0) {
                            let missingCrates = Math.ceil(missingStorage / crateVolume);
                            let cratesToUnassign = Math.min(storageAdjustments[j].calculatedCrates, missingCrates);

                            if (settings.storageSafeReassign || storageList[j].storeOverflow) {
                                let emptyCrates = Math.floor(otherFreeStorage / containerVolume);
                                cratesToUnassign = Math.min(cratesToUnassign, emptyCrates);
                            }

                            storageAdjustments[j].adjustCrates -= cratesToUnassign;
                            storageAdjustments[j].calculatedCrates -= cratesToUnassign;
                            totalCrates += cratesToUnassign;
                            missingStorage -= cratesToUnassign * crateVolume;
                            otherFreeStorage -= cratesToUnassign * crateVolume;
                        }

                        // Unassign containers, if we still need them
                        if (storageAdjustments[j].calculatedContainers > 0 && missingStorage > 0){
                            let missingContainers = Math.ceil(missingStorage / containerVolume);
                            let containersToUnassign = Math.min(storageAdjustments[j].calculatedContainers, missingContainers);

                            if (settings.storageSafeReassign || storageList[j].storeOverflow) {
                                let emptyContainers = Math.floor(otherFreeStorage / containerVolume);
                                containersToUnassign = Math.min(containersToUnassign, emptyContainers);
                            }

                            storageAdjustments[j].adjustContainers -= containersToUnassign;
                            storageAdjustments[j].calculatedContainers -= containersToUnassign;
                            totalContainers += containersToUnassign;
                            missingStorage -= containersToUnassign * containerVolume;
                            //otherFreeStorage -= containersToUnassign * containerVolume;
                        }

                        // If we got all we needed - get back to assigning
                        if (missingStorage <= 0){
                            break;
                        }
                    }
                }
                // Restore missing storage, in case if was changed during unassignment
                missingStorage = extraStorageRequired - extraStorage;

                // Add crates
                if (totalCrates > 0) {
                    let missingCrates = Math.ceil(missingStorage / crateVolume);
                    let allowedCrates = resource.autoCratesMax - storageAdjustments[i].calculatedCrates;
                    let addCrates = Math.min(totalCrates, allowedCrates, missingCrates);
                    totalCrates -= addCrates;
                    storageAdjustments[i].adjustCrates += addCrates;
                    missingStorage -= addCrates * crateVolume;
                }

                // Add containers
                if (totalContainers > 0 && missingStorage > 0){
                    let missingContainers = Math.ceil(missingStorage / containerVolume);
                    let allowedContainers = resource.autoContainersMax - storageAdjustments[i].calculatedContainers;
                    let addContainers = Math.min(totalContainers, allowedContainers, missingContainers);
                    totalContainers -= addContainers;
                    storageAdjustments[i].adjustContainers += addContainers;
                    missingStorage -= addContainers * containerVolume;
                }

                if (missingStorage > 0){
                    totalStorageMissing += missingStorage;
                }
            }
        }

        // Build more storage if we didn't had enough
        if (totalStorageMissing > 0){
            let numberOfCratesWeCanBuild = resources.Crates.maxQuantity - resources.Crates.currentQuantity;
            let numberOfContainersWeCanBuild = resources.Containers.maxQuantity - resources.Containers.currentQuantity;

            resources.Crates.resourceRequirements.forEach(requirement =>
                numberOfCratesWeCanBuild = Math.min(numberOfCratesWeCanBuild, requirement.resource.currentQuantity / requirement.quantity)
            );

            resources.Containers.resourceRequirements.forEach(requirement =>
                numberOfContainersWeCanBuild = Math.min(numberOfContainersWeCanBuild, requirement.resource.currentQuantity / requirement.quantity)
            );

            if (settings.storageLimitPreMad && !isResearchUnlocked("mad")) {
              // Only build pre-mad containers when steel storage is over 80%
              if (resources.Steel.storageRatio < 0.8) {
                  numberOfContainersWeCanBuild = 0;
              }
              // Only build pre-mad crates when already have Plywood for next level of library
              if (isLumberRace() && state.cityBuildings.Library.resourceRequirements.some(requirement => requirement.resource === resources.Plywood && requirement.quantity > resources.Plywood.currentQuantity) && (state.cityBuildings.StorageYard.count > 1 || state.cityBuildings.Wharf.count > 1)) {
                  numberOfCratesWeCanBuild = 0;
              }
            }

            // Build crates
            let cratesToBuild = Math.min(numberOfCratesWeCanBuild, Math.ceil(totalStorageMissing / crateVolume));
            m.tryConstructCrate(cratesToBuild);

            // And containers, if still needed
            totalStorageMissing -= cratesToBuild * crateVolume;
            if (totalStorageMissing > 0) {
                let containersToBuild = Math.min(numberOfContainersWeCanBuild, Math.ceil(totalStorageMissing / crateVolume));
                m.tryConstructContainer(containersToBuild);
            }
        }

        // Go to clicking, unassign first
        storageAdjustments.forEach(adjustment => {
            if (adjustment.adjustCrates < 0) {
                adjustment.resource.tryUnassignCrate(adjustment.adjustCrates * -1);
            }
            if (adjustment.adjustContainers < 0) {
                adjustment.resource.tryUnassignContainer(adjustment.adjustContainers * -1);
            }
        });

        // And now assign
        storageAdjustments.forEach(adjustment => {
            if (adjustment.adjustCrates > 0) {
                adjustment.resource.tryAssignCrate(adjustment.adjustCrates);
            }
            if (adjustment.adjustContainers > 0) {
                adjustment.resource.tryAssignContainer(adjustment.adjustContainers);
            }
        });
    }

    function autoMinorTrait() {
        let traitList = state.minorTraitManager.managedPriorityList();

        if (traitList.length === 0) {
            return;
        }

        let totalWeighting = 0;
        let totalGeneCost = 0;

        traitList.forEach(trait => {
            //console.log(`trait ${trait.traitName} weighting ${trait.autoMinorTraitWeighting} cost ${trait.geneCost} unlocked ${trait.isUnlocked()}`)
            totalWeighting += trait.autoMinorTraitWeighting;
            totalGeneCost += trait.geneCost;
        });

        traitList.forEach(trait => {
            if (trait.autoMinorTraitWeighting / totalWeighting >= trait.geneCost / totalGeneCost) {
                if (resources.Genes.currentQuantity > trait.geneCost) {
                    //console.log("trying to buy " + trait.traitName + " at cost " + trait.geneCost)
                    state.minorTraitManager.tryBuyWithGenes(trait.traitName, 1);
                }
            }
        });
    }

    function adjustTradeRoutes() {
        let m = state.marketManager;
        let tradableResources = m.getSortedTradeRouteSellList();
        let maxTradeRoutes = m.getMaxTradeRoutes();
        let tradeRoutesUsed = 0;
        let currentMoneyPerSecond = resources.Money.calculatedRateOfChange;
        let requiredTradeRoutes = [];
        let adjustmentTradeRoutes = [];
        let resourcesToTrade = [];

        // Fill our trade routes with selling
        for (let i = 0; i < tradableResources.length; i++) {
            const resource = tradableResources[i];
            requiredTradeRoutes.push(0);

            if (tradeRoutesUsed < maxTradeRoutes && resource.autoTradeSellEnabled && resource.storageRatio > 0.98){
              let freeRoutes = maxTradeRoutes - tradeRoutesUsed;
              let routesToLimit = Math.floor((resource.calculatedRateOfChange - resource.autoTradeSellMinPerSecond) / resource.tradeRouteQuantity);
              let routesToAssign = Math.min(freeRoutes, routesToLimit);
              if (routesToAssign > 0){
                tradeRoutesUsed += routesToAssign;
                requiredTradeRoutes[i] -= routesToAssign;
                resource.calculatedRateOfChange -= resource.tradeRouteQuantity * routesToAssign;
                currentMoneyPerSecond += resource.currentTradeRouteSellPrice * routesToAssign;
              }
            }

            //console.log(resource.id + " tradeRoutesUsed " + tradeRoutesUsed + ", maxTradeRoutes " + maxTradeRoutes + ", storageRatio " + resource.storageRatio + ", calculatedRateOfChange " + resource.calculatedRateOfChange)
            if (resource.autoTradeBuyEnabled && resource.autoTradeBuyRoutes > 0) {
                resourcesToTrade.push( {
                    resource: resource,
                    requiredTradeRoutes: resource.autoTradeBuyRoutes,
                    completed: false,
                    index: tradableResources.findIndex(tradeable => tradeable.id === resource.id),
                } );
            }
        }

        //console.log("current money per second: " + currentMoneyPerSecond);
        let minimumAllowedMoneyPerSecond = Math.max(settings.tradeRouteMinimumMoneyPerSecond, settings.tradeRouteMinimumMoneyPercentage / 100 * currentMoneyPerSecond)
        minimumAllowedMoneyPerSecond = Math.min(minimumAllowedMoneyPerSecond, resources.Money.maxQuantity - resources.Money.currentQuantity);
        //console.log("minimum money per second: " + minimumAllowedMoneyPerSecond + " based on current money per second of " + currentMoneyPerSecond)

        let overrideTradesFor = [];

        // Buildings queue
        if (settings.queueRequest && game.global.queue.display) {
            for (let i = 0; i < game.global.queue.queue.length; i ++) {
                let queue = game.global.queue.queue[i];
                overrideTradesFor.push(queue.id);
                if (!game.global.settings.qAny) {
                    break;
                }
            }
        }

        // Research queue
        if (settings.queueRequest && game.global.r_queue.display) {
            for (let i = 0; i < game.global.r_queue.queue.length; i ++) {
                let queue = game.global.r_queue.queue[i];
                overrideTradesFor.push(queue.id);
                if (!game.global.settings.qAny) {
                    break;
                }
            }
        }

        // Active triggers
        if (settings.triggerRequest) {
            for (let i = 0; i < state.triggerManager.targetTriggers.length; i++) {
                let trigger = state.triggerManager.targetTriggers[i];
                overrideTradesFor.push(trigger.actionId);
            }
        }

        if (overrideTradesFor.length > 0) {
            let demandedTrades = [];
            for (let i = 0; i < overrideTradesFor.length; i++){
                let id = overrideTradesFor[i];

                // Look for building, tech, or project. We have no lookup table for arpa, but it shouldn't be the issue, as there's only 5 of them
                let demandedObject = buildingIds[id] || tech[id] || state.projectManager.priorityList.find(project => ("arpa" + project.id) === id);

                // Got something
                if (demandedObject) {
                    if (demandedObject instanceof Technology) {
                        // Techs doesn't updates automatically, unlike buildings or projects, we need to do it explicitly
                        demandedObject.updateResourceRequirements();
                    }
                    let costMod = 1;
                    if (demandedObject instanceof Project) {
                        // For project let's check what percent of it already constructed
                        costMod = 1 - demandedObject.instance.complete * 0.01;
                    }
                    for (let j = 0; j < demandedObject.resourceRequirements.length; j++) {
                        let resource = demandedObject.resourceRequirements[j].resource;
                        let required = demandedObject.resourceRequirements[j].quantity * costMod;

                        // We need to check storage ratio here, as queued buildings may be unaffordable(especially arpa, as it check full cost, not just 1%), and we don't want to import capped resources, or drop imports having full banks
                        if (resource.currentQuantity >= required || resource.storageRatio > 0.98){
                            continue;
                        }
                        // Need more money, drop old buyings even if won't set new trades
                        if (resource === resources.Money) {
                            resourcesToTrade = [];
                            continue;
                        }
                        if (!resource.isTradable()) {
                            continue;
                        }

                        // Calculate amount of routes we need
                        let routes = Math.ceil((required - resource.currentQuantity) / resource.tradeRouteQuantity);

                        // Add routes
                        demandedTrades.push({
                            resource: resource,
                            requiredTradeRoutes: routes,
                            completed: false,
                            index: tradableResources.findIndex(tradeable => tradeable.id === resource.id),
                        });
                    }
                }
            }
            if (demandedTrades.length > 0) {
                // Override regular routes, to get demanded sooner
                resourcesToTrade = demandedTrades;
                // Drop minimum income, if we have something on demand, but can't trade with our income
                if (minimumAllowedMoneyPerSecond > resources.Money.calculatedRateOfChange){
                    minimumAllowedMoneyPerSecond = 0;
                }
            }
        }

        while (resourcesToTrade.some(resource => !resource.completed)) {
            for (let i = 0; i < resourcesToTrade.length; i++) {
                const resourceToTrade = resourcesToTrade[i];
                //console.log(state.loopCounter + " " + resourceToTrade.resource.id + " testing...")

                // The resources is not currenlty unlocked or we've done all we can or we already have max storage so don't trade for more of it
                if (resourceToTrade.index === -1 || resourceToTrade.completed || resourceToTrade.resource.storageRatio > 0.98) {
                    //console.log(state.loopCounter + " " + resourceToTrade.resource.id + " completed 1 - " + resourceToTrade.index)
                    resourceToTrade.completed = true;
                    continue;
                }

                // If we have free trade routes and we want to trade for more resources and we can afford it then just do it
                if (!resourceToTrade.completed
                            && tradeRoutesUsed < maxTradeRoutes
                            && resourceToTrade.requiredTradeRoutes > requiredTradeRoutes[resourceToTrade.index]
                            && currentMoneyPerSecond - resourceToTrade.resource.currentTradeRouteBuyPrice > minimumAllowedMoneyPerSecond) {
                    currentMoneyPerSecond -= resourceToTrade.resource.currentTradeRouteBuyPrice;
                    tradeRoutesUsed++;
                    requiredTradeRoutes[resourceToTrade.index]++;
                    //console.log(state.loopCounter + " " + resourceToTrade.resource.id + " adding trade route - " + resourceToTrade.index)
                    continue;
                }

                // We're buying enough resources now or we don't have enough money to buy more anyway
                if (resourceToTrade.requiredTradeRoutes === requiredTradeRoutes[resourceToTrade.index]
                            || currentMoneyPerSecond - resourceToTrade.resource.currentTradeRouteBuyPrice < minimumAllowedMoneyPerSecond) {
                    //console.log(state.loopCounter + " " + resourceToTrade.resource.id + " completed 2")
                    resourceToTrade.completed = true;
                    continue;
                }

                // We're out of trade routes because we're selling so much. Remove them one by one until we can afford to buy again
                if (resourceToTrade.requiredTradeRoutes > requiredTradeRoutes[resourceToTrade.index]) {
                    let addedTradeRoute = false;

                    for (let i = tradableResources.length - 1; i >= 0; i--) {
                        if (addedTradeRoute) {
                            break;
                        }

                        const resource = tradableResources[i];
                        let currentRequired = requiredTradeRoutes[i];
                        let reducedMoneyPerSecond = 0;

                        // We can't remove it if we're not selling it or if we are looking at the same resource
                        if (currentRequired >= 0 || resourceToTrade.resource === resource) {
                            continue;
                        }

                        while (currentRequired < 0 && resourceToTrade.requiredTradeRoutes > requiredTradeRoutes[resourceToTrade.index]) {
                            currentRequired++;
                            reducedMoneyPerSecond += resource.currentTradeRouteSellPrice;

                            if (currentMoneyPerSecond - reducedMoneyPerSecond - resourceToTrade.resource.currentTradeRouteBuyPrice > minimumAllowedMoneyPerSecond) {
                                currentMoneyPerSecond -= reducedMoneyPerSecond;
                                currentMoneyPerSecond -= resourceToTrade.resource.currentTradeRouteBuyPrice;
                                //console.log(state.loopCounter + " " + resourceToTrade.resource.id + " current money per second: " + currentMoneyPerSecond);
                                requiredTradeRoutes[resourceToTrade.index]++;
                                requiredTradeRoutes[i] = currentRequired;
                                addedTradeRoute = true;

                                if (requiredTradeRoutes[resourceToTrade.index] === resourceToTrade.requiredTradeRoutes) {
                                    //console.log(state.loopCounter + " " + resourceToTrade.resource.id + " completed 3")
                                    resourceToTrade.completed = true;
                                }
                                break;
                            }
                        }
                    }

                    // We couldn't adjust enough trades to allow us to afford this resource
                    if (!addedTradeRoute) {
                        //console.log(state.loopCounter + " " + resourceToTrade.resource.id + " completed 4")
                        resourceToTrade.completed = true;
                    }
                }
            }
        }

        // Calculate adjustments
        for (let i = 0; i < tradableResources.length; i++) {
            //console.log(tradableResources[i].id + " " + (requiredTradeRoutes[i] - tradableResources[i].currentTradeRoutes))
            adjustmentTradeRoutes.push(requiredTradeRoutes[i] - tradableResources[i].currentTradeRoutes);
        }

        // Adjust our trade routes - always adjust towards zero first to free up trade routes
        for (let i = 0; i < tradableResources.length; i++) {
            const resource = tradableResources[i];

            if (adjustmentTradeRoutes[i] > 0 && resource.currentTradeRoutes < 0) {
                m.addTradeRoutes(resource, adjustmentTradeRoutes[i]);
                adjustmentTradeRoutes[i] = 0;
            } else if (adjustmentTradeRoutes[i] < 0 && resource.currentTradeRoutes > 0) {
                m.removeTradeRoutes(resource, -1 * adjustmentTradeRoutes[i]);
                adjustmentTradeRoutes[i] = 0;
            }
        }

        // Adjust our trade routes - we've adjusted towards zero, now adjust the rest
        for (let i = 0; i < tradableResources.length; i++) {
            const resource = tradableResources[i];

            if (adjustmentTradeRoutes[i] > 0) {
                m.addTradeRoutes(resource, adjustmentTradeRoutes[i]);
            } else if (adjustmentTradeRoutes[i] < 0) {
                m.removeTradeRoutes(resource, -1 * adjustmentTradeRoutes[i]);
            }
            // Add sold resources to rate of change, so we can still use it
            // Bought resources ignored, to avoid ending with negative income when trade routes readjusted to another resource
            if (requiredTradeRoutes[i] < 0){
                resource.calculatedRateOfChange -= requiredTradeRoutes[i] * resource.tradeRouteQuantity;
            }
        }
        resources.Money.calculatedRateOfChange = currentMoneyPerSecond;
    }

    //#endregion Auto Trade Specials

    //#region Main Loop

    function updateState() {
        if (game.global.race.species === speciesProtoplasm) {
            state.goal = "Evolution";
        } else if (state.goal === "Evolution") {
            // Check what we got after evolution
            if (settings.autoEvolution && settings.userEvolutionTarget === "auto" && settings.evolutionBackup){
                let stars = alevel();
                let newRace = races[game.global.race.species];

                console.log("Race: " + newRace.name + ", " + (stars-1) + "★ achievement: " + newRace.isMadAchievementUnlocked(stars));
                if (newRace.isMadAchievementUnlocked(stars)) {
                    let raceGroup = state.raceGroupAchievementList.findIndex(group => group.includes(newRace));

                    if (!settings.evolutionIgnore[raceGroup]) {
                      // Let's double check it's actually *soft* reset
                      let resetButton = document.querySelector(".reset .button:not(.right)");
                      if (resetButton.innerText === game.loc("reset_soft")) {
                          state.log.logSuccess(loggingTypes.special, `${newRace.name} extinction achievement already earned, ignoring group, and restoring backup.`);

                          // Restoring backup reloads page, so we need to store list of ignored groups in settings
                          settings.evolutionIgnore[raceGroup] = true;
                          updateSettingsFromState();

                          state.goal = "GameOverMan";
                          resetButton.click();
                          return;
                      }
                    } else {
                      // Group already ignored - probably we tried all available options, and using fallback race now.
                      state.log.logSuccess(loggingTypes.special, `Couldn't select race with unearned achievements. Continuing with ${newRace}.`);
                    }
                }
            }
            state.goal = "Standard";
            updateTriggerSettingsContent(); // We've moved from evolution to standard play. There are technology descriptions that we couldn't update until now.
            resources.Population._instance = game.global.resource[resources.Population.id]; // We need to update cached population instance
        }
        // Not evolving anymore, clear ignore list
        settings.evolutionIgnore = {};

        state.buildingManager.updateResourceRequirements();
        state.projectManager.updateResourceRequirements();
        state.triggerManager.updateCompleteTriggers();
        state.triggerManager.resetTargetTriggers();

        // Reset calculated rate of changes, and required storage
        for (let id in resources) {
            resources[id].calculatedRateOfChange = resources[id].rateOfChange;
            resources[id].storageRequired = 0;
        }

        // Reset traded resources, so we can reuse it
        // game.tradeRatio holds rates for selling, while amount of bought goods is affected by various multipliers, so we're using game.breakdown here to retrieve correct numbers
        if (settings.autoMarket) {
            let tradableResources = state.marketManager.getSortedTradeRouteSellList();
            for (let i = 0; i < tradableResources.length; i++) {
                let resourceDiff = game.breakdown.p.consume[tradableResources[i].id];
                if (resourceDiff.Trade) {
                    tradableResources[i].calculatedRateOfChange -= resourceDiff.Trade;
                }
            }
            let moneyDiff = game.breakdown.p.consume["Money"];
            if (moneyDiff.Trade){
                resources.Money.calculatedRateOfChange -= moneyDiff.Trade;
            }
        }

        // Same for ejected resources
        if (settings.prestigeWhiteholeEjectEnabled && state.spaceBuildings.BlackholeMassEjector.stateOnCount > 0) {
            resourcesByAtomicMass.forEach(eject => {
                eject.resource.calculatedRateOfChange += game.global.interstellar.mass_ejector[eject.resource.id];
            });
        }

        if (settings.minimumMoneyPercentage > 0) {
            state.minimumMoneyAllowed = resources.Money.maxQuantity * settings.minimumMoneyPercentage / 100;
        } else {
            state.minimumMoneyAllowed = settings.minimumMoney;
        }

        // Get list of all unlocked techs, and find biggest numbers for each resource
        // Required amount increased by 3% from actual numbers, as other logic of script can and will try to prevent overflowing by selling\ejecting\building projects, and that might cause an issues if we'd need 100% of storage
        $("#tech .action a:first-child").each(function() {
            Object.entries($(this).data()).forEach(([name, amount]) => {
                let resource = resLowIds[name];
                if (resource !== undefined) {
                    resource.storageRequired = Math.max(amount*1.03, resource.storageRequired);
                }
            });
        });

        // We need to preserve amount of knowledge required by techs only, while amount still not polluted
        // by buildings - wardenclyffe, labs, etc. This way we can determine what's our real demand is.
        // Otherwise they might start build up knowledge cap just to afford themselves, increasing required
        // cap further, so we'll need more labs, and they'll demand even more knowledge for next level and so on.
        state.knowledgeRequiredByTechs = resources.Knowledge.storageRequired;

        // Same for fuels, but we'll need to actually calculate it
        state.oilRequiredByMissions = 0;
        state.heliumRequiredByMissions = 0;

        // For building using data attributes is not optimal, as they doesn't updates in real time
        state.buildingManager.priorityList.forEach(building => {
            if (building.isUnlocked() && building.autoBuildEnabled){
                building.resourceRequirements.forEach(requirement => {
                    requirement.resource.storageRequired = Math.max(requirement.quantity*1.03, requirement.resource.storageRequired);

                    if (building.is.mission){
                        if (requirement.resource === resources.Helium_3){
                            state.heliumRequiredByMissions = Math.max(requirement.quantity*1.03, state.heliumRequiredByMissions);
                        }
                        if (requirement.resource === resources.Oil){
                            state.oilRequiredByMissions = Math.max(requirement.quantity*1.03, state.oilRequiredByMissions);
                        }
                    }
                });
            }
        });

        // Same for projects
        state.projectManager.managedPriorityList().forEach(project => {
            project.resourceRequirements.forEach(requirement => {
                // 0.0103 multiplier it's 3% extra above 1/100 of full cost.
                requirement.resource.storageRequired = Math.max(requirement.quantity*0.0103, requirement.resource.storageRequired);
            });
        });

        // Should be called after calculating rate of change
        state.buildingManager.updateWeighting();

        // If our script opened a modal window but it is now closed (and the script didn't close it) then the user did so don't continue
        // with whatever our script was doing with the open modal window.
        if (state.windowManager.openedByScript && !state.windowManager.isOpenHtml()) {
            state.windowManager.resetWindowManager();
        }

        if (isLumberRace()) {
            resources.Crates.resourceRequirements[0].resource = resources.Plywood;
            resources.Crates.resourceRequirements[0].quantity = 10;
        } else {
            resources.Crates.resourceRequirements[0].resource = resources.Stone;
            resources.Crates.resourceRequirements[0].quantity = 200;
        }

        if (isEvilRace() && !isEvilUniverse() && state.jobs.Lumberjack !== state.jobManager.unemployedJob) {
            state.jobs.Lumberjack.setJobOverride(state.jobManager.unemployedJob);
        }

        if (isHunterRace() && state.jobs.Farmer !== state.jobManager.unemployedJob) {
            state.jobs.Farmer.setJobOverride(state.jobManager.unemployedJob);
        }
    }

    function verifyGameActions() {
            // Check for fidelity of game actions code - a lot of buildings specify power when they don't use any...
            // The following line of code is copied directly from the game code:
            let p_structs = [
                'city:apartment','int_alpha:habitat','int_alpha:luxury_condo','spc_red:spaceport','int_alpha:starport','int_blackhole:s_gate','gxy_gateway:starbase','gxy_gateway:ship_dock','int_neutron:stellar_forge',
                'int_neutron:citadel','city:coal_mine','spc_moon:moon_base','spc_red:red_tower','spc_home:nav_beacon','int_proxima:xfer_station','gxy_stargate:telemetry_beacon',
                'int_nebula:nexus','gxy_stargate:gateway_depot','spc_dwarf:elerium_contain','spc_gas:gas_mining','spc_belt:space_station','spc_gas_moon:outpost','gxy_gorddon:embassy',
                'gxy_gorddon:dormitory','gxy_alien1:resort','spc_gas_moon:oil_extractor','int_alpha:int_factory','city:factory','spc_red:red_factory','spc_dwarf:world_controller',
                'prtl_fortress:turret','prtl_badlands:war_drone','city:wardenclyffe','city:biolab','city:mine','city:rock_quarry','city:cement_plant','city:sawmill','city:mass_driver',
                'int_neutron:neutron_miner','prtl_fortress:war_droid','prtl_pit:soul_forge','gxy_chthonian:excavator','int_blackhole:far_reach','prtl_badlands:sensor_drone',
                'prtl_badlands:attractor','city:metal_refinery','gxy_stargate:gateway_station','gxy_alien1:vitreloy_plant','gxy_alien2:foothold','gxy_gorddon:symposium',
                'int_blackhole:mass_ejector','city:casino','spc_hell:spc_casino','prtl_fortress:repair_droid','gxy_stargate:defense_platform','prtl_pit:gun_emplacement','prtl_pit:soul_attractor','int_sirius:ascension_trigger'];

            // Perform the check
            state.buildingManager.priorityList.forEach(building => {
                if (building.powered > 0) {
                    let tempId = (building._location !== "" ? building._location : building._tab) + ":" + building.id
                    let tempIndex = p_structs.indexOf(tempId);
                    if (tempIndex === -1) {
                        console.log("Found building that is specified in game actions code as powered but isn't included in powered calculations: " + tempId);
                    }
                }
            });

            // Check that actions that exist in game also exist in our script
            verifyGameActionsExist(game.actions.evolution, state.evolutions, false);
            verifyGameActionsExist(game.actions.city, state.cityBuildings, false);
            verifyGameActionsExist(game.actions.space, state.spaceBuildings, true);
            verifyGameActionsExist(game.actions.interstellar, state.spaceBuildings, true);
            verifyGameActionsExist(game.actions.portal, state.spaceBuildings, true);
            verifyGameActionsExist(game.actions.galaxy, state.spaceBuildings, true);
    }

    function verifyGameActionsExist(gameObject, scriptObject, hasSubLevels) {
        let scriptKeys = Object.keys(scriptObject);
        Object.keys(gameObject).forEach(gameActionKey => {
            if (!hasSubLevels) {
                verifyGameActionExists(scriptKeys, scriptObject, gameActionKey, gameObject);
            } else {
                // This object has sub levels - iterate through them
                let gameSubObject = gameObject[gameActionKey];
                Object.keys(gameSubObject).forEach(gameSubActionKey => {
                    verifyGameActionExists(scriptKeys, scriptObject, gameSubActionKey, gameSubObject);
                });
            }
        });
    }

    function verifyGameActionExists(scriptKeys, scriptObject, gameActionKey, gameObject) {
        // We know that we don't have the info objects defined in our script
        // XXXX is special. The key doesn't match the object in the game code
        // gift is a special santa gift. Leave it to the player.
        if (gameActionKey === "info" || gameActionKey === "gift") {
            return;
        }

        let scriptActionFound = false;

        for (let i = 0; i < scriptKeys.length; i++) {
            const scriptAction = scriptObject[scriptKeys[i]];
            if (scriptAction.id === gameActionKey) {
                scriptActionFound = true;
                break;
            }
        }

        if (!scriptActionFound) {
            console.log("Game action key not found in script: " + gameActionKey + " (" + gameObject[gameActionKey].id + ")");
            console.log(gameObject[gameActionKey]);
        }
    }

    function initialiseWeightingRules(){
        // Weighting rules consists of 4 lambdas: generic condition, weighting condition, note, and multiplier
        // Generic condition will be checked just once per tick, before calculating weights. They takes nothing and return bool - whether this rule is applicable, or not
        // Passed rules will be checked against each building. Weighting condition takes current building, and return any value, if value casts to true - rule aplies
        // Return value of second lambda and building goes in third lambda, which return a note displayed when rule applied
        // Forth lambda return multiplier. Rules returning x1 multipliers won't ever be checked, thus it doesn't take any arguments, so it can be called without context

        weightingRules = [[
              () => true,
              (building) => !building.isUnlocked(),
              () => "Locked",
              () => 0 // Should always be on top, processing locked building may lead to issues
          ],[
              () => true,
              (building) => !building.autoBuildEnabled,
              () => "AutoBuild disabled",
              () => 0 // Configured in autoBuild
          ],[
              () => true,
              (building) => building.count >= building.autoMax,
              () => "Maximum amount reached",
              () => 0 // Configured in autoBuild
          ],[
              () => true,
              (building) => !game.checkAffordable(building.definition, true),
              () => "Not enough storage",
              () => 0 // Red buildings need to be filtered out, so they won't prevent affordable buildings with lower weight from building
          ],[
              () => game.global.race[racialTraitSlaver],
              (building) => {
                  if (building === state.cityBuildings.SlaveMarket) {
                      if (resources.Slave.currentQuantity >= resources.Slave.maxQuantity) {
                          return "Slave pens already full";
                      }
                      if (resources.Money.storageRatio < 0.9 && resources.Money.currentQuantity < 10000000){
                          return "Buying slaves only with excess money";
                      }
                  }
              },
              (note) => note,
              () => 0 // Slave Market
          ],[
              () => game.global.race[racialTraitCannibalize],
              (building) => {
                  if (building === state.cityBuildings.SacrificialAltar && building.count > 0) {
                      if (resources.Population.currentQuantity < 20) {
                          return "Too low population";
                      }
                      if (resources.Population.currentQuantity !== resources.Population.maxQuantity) {
                          return "Sacrifices performed only with full population";
                      }

                      let sacrifices = game.global.civic.d_job !== 'unemployed' ? game.global.civic[game.global.civic.d_job].workers : game.global.civic.free;
                      if (sacrifices < 1) {
                          return "No default workers to sacrifice";
                      }

                      if (game.global.city.s_alter.rage >= 3600 && game.global.city.s_alter.regen >= 3600 &&
                          game.global.city.s_alter.mind >= 3600 && game.global.city.s_alter.mine >= 3600 &&
                          (game.global.race[racialTraitKindlingKindred] || game.global.city.s_alter.harvest >= 3600)){
                          return "Sacrifice bonus already high enough";
                      }
                  }
              },
              (note) => note,
              () => 0 // Sacrificial Altar
          ],[
              () => true,
              (building) => state.triggerManager.buildingConflicts(building),
              (trigger, building) => trigger.actionType === "build" && trigger.actionId === building.settingId ?
                          `Processing trigger: ${trigger.desc}` :
                          `Conflicts with trigger: ${trigger.desc}`,
              () => settings.buildingWeightingTriggerConflict
          ],[
              () => true,
              (building) => building.missingSupply(),
              (supply) => supply.rate > 0 ?
                          `Missing ${supply.resource.name} to operate` :
                          `Provided ${supply.resource.name} not currently needed`,
              () => settings.buildingWeightingMissingSupply
          ],[
              () => true,
              (building) => building._tab === "city" && building.stateOffCount > 0,
              () => "Still have some non operating buildings",
              () => settings.buildingWeightingNonOperatingCity
          ],[
              () => true,
              (building) => building._tab !== "city" && building.stateOffCount > 0,
              () => "Still have some non operating buildings",
              () => settings.buildingWeightingNonOperating
          ],[
              () => !settings.prestigeBioseedConstruct,
              (building) => building === state.spaceBuildings.GasSpaceDockShipSegment || building === state.spaceBuildings.GasSpaceDockProbe,
              () => "Bioseed prestige disabled",
              () => 0
          ],[
              () => settings.prestigeType === "mad" && (tech['mad'].isResearched() || game.checkAffordable(tech['mad'].definition, true)),
              (building) => !building.is.housing && !building.is.garrison,
              () => "Awaiting MAD prestige",
              () => settings.buildingWeightingMADUseless
          ],[
              () => true,
              (building) => building.count === 0,
              () => "New building",
              () => settings.buildingWeightingNew
          ],[
              () => resources.Power.isUnlocked() && resources.Power.currentQuantity < 1,
              (building) => building.powered < 0,
              () => "Need more energy",
              () => settings.buildingWeightingNeedfulPowerPlant
          ],[
              () => resources.Power.isUnlocked() && resources.Power.currentQuantity > 1,
              (building) => building.powered < 0,
              () => "No need for more energy",
              () => settings.buildingWeightingUselessPowerPlant
          ],[
              () => resources.Power.isUnlocked() && resources.Power.currentQuantity < 1,
              (building) => building.powered > 0 && building.powered > resources.Power.currentQuantity,
              () => "Not enough energy",
              () => settings.buildingWeightingUnderpowered
          ],[
              () => state.knowledgeRequiredByTechs < resources.Knowledge.maxQuantity,
              (building) => building.is.knowledge,
              () => "No need for more knowledge",
              () => settings.buildingWeightingUselessKnowledge
          ],[
              () => state.knowledgeRequiredByTechs > resources.Knowledge.maxQuantity,
              (building) => building.is.knowledge,
              () => "Need more knowledge",
              () => settings.buildingWeightingNeedfulKnowledge
          ],[
              () => state.spaceBuildings.BlackholeMassEjector.isUnlocked(),
              (building) => building === state.spaceBuildings.BlackholeMassEjector && building.count * 1000 - game.global.interstellar.mass_ejector.total > 100,
              () => "Still have some unused ejectors",
              () => settings.buildingWeightingUnusedEjectors
          ],[
              () => resources.Crates.maxQuantity > 0,
              (building) => building === state.cityBuildings.StorageYard,
              () => "Still have some unused crates",
              () => settings.buildingWeightingCrateUseless
          ],[
              () => resources.Containers.maxQuantity > 0,
              (building) => building === state.cityBuildings.Warehouse,
              () => "Still have some unused containers",
              () => settings.buildingWeightingCrateUseless
          ],[
              () => resources.Helium_3.maxQuantity < state.heliumRequiredByMissions || resources.Oil.maxQuantity < state.oilRequiredByMissions,
              (building) => building === state.cityBuildings.OilDepot || building === state.spaceBuildings.SpacePropellantDepot || building === state.spaceBuildings.GasStorage,
              () => "Need more fuel",
              () => settings.buildingWeightingMissingFuel
        ]];
    }

    function initialiseScript() {
        let tempTech = {};
        //@ts-ignore
        for (let [technology, action] of Object.entries(game.actions.tech)) {
            tempTech[technology] = new Technology(action);
            techIds[action.id] = tempTech[technology];
        }

        Object.keys(tempTech).sort().forEach(function(key) {
            tech[key] = tempTech[key];
        });

        // Filling lookup table for data attributes
        for (let id in resources) {
            let resource = resources[id];
            resLowIds[resource.id.toLowerCase()] = resource;
        }

        // And for buildings popups
        for (let i = 0; i < state.buildingManager.priorityList.length; i++){
            let building = state.buildingManager.priorityList[i];
            buildingIds[building.settingId] = building;
        }

        updateStateFromSettings();
        updateSettingsFromState();

        state.triggerManager.priorityList.forEach(trigger => {
            trigger.complete = false;
        });

        // If debug logging is enabled then verify the game actions code is both correct and in sync with our script code
        if (showLogging) {
            verifyGameActions();
        }

        // Set up our sorted resource atomic mass array
        Object.keys(resources).forEach(resourceKey => {
            let resource = resources[resourceKey];
            if (resource === resources.Elerium || resource === resources.Infernite) { return; } // We'll add these exotic resources to the front of the list after sorting as these should always come first

            if (resource.isEjectable()) {
                resourcesByAtomicMass.push({ resource: resource, requirement: 0, });
            }
        });
        resourcesByAtomicMass.sort((a, b) => b.resource.atomicMass - a.resource.atomicMass );
        // Elerium and infernite are always first as they are the exotic resources which are worth the most DE
        resourcesByAtomicMass.unshift({ resource: resources.Infernite, requirement: 0, });
        resourcesByAtomicMass.unshift({ resource: resources.Elerium, requirement: 0, });

    }

    function automate() {
        // game.breakdown initializes during first game tick, dont tick script untill it happened
        if (!game.breakdown.p.consume) {
            return;
        }

        // console.log("Loop: " + state.loopCounter + ", goal: " + state.goal);
        if (state.loopCounter < Number.MAX_SAFE_INTEGER) {
            state.loopCounter++;
        } else {
            state.loopCounter = 1;
        }

        updateState();
        updateUI();

        // The user has turned off the master toggle. Stop taking any actions on behalf of the player.
        // We've still updated the UI etc. above; just not performing any actions.
        if (!settings.masterScriptToggle) { return; }

        if (modifierKeyPressed()) {
            return;
        }

        if (state.goal === "GameOverMan"){
            return;
        }

        if (state.goal === "Evolution") {
            if (settings.autoEvolution) {
                autoEvolution();
            }
            return;
        }

        let massEjectorProcessed = false;
        if (state.spaceBuildings.BlackholeMassEjector.stateOnCount >= settings.prestigeWhiteholeEjectAllCount) {
            autoMassEjector(); // We do this at the start and end of the function. If eject all is required then this will occur at the start; otherwise process at the end
            massEjectorProcessed = true;
        }

        if (settings.buildingAlwaysClick || settings.autoBuild){
            autoGatherResources();
        }
        if (settings.autoMarket) {
            autoMarket();
        }
        if (settings.govManage) {
            manageGovernment();
        }
        if (settings.autoFight) {
            autoBattle();
            manageSpies();
        }
        if (settings.autoARPA) {
            autoArpa();
        }
        if (settings.autoBuild) {
            autoBuild();
        }
        if (settings.autoCraft) {
            autoCraft();
        }
        if (settings.autoResearch) {
            autoResearch();
        }
        if (settings.autoStorage) {
            autoStorage();
        }
        if (settings.autoJobs) {
            autoJobs();
        }
        if (settings.autoTax) {
            autoTax();
        }
        if (settings.autoHell) {
            autoHell();
        }
        if (settings.autoPower) {
            autoBuildingPriority();
        }
        if (settings.autoFactory) {
            autoFactory();
        }
        if (settings.autoMiningDroid) {
            autoMiningDroid();
        }
        if (settings.autoGraphenePlant) {
            autoGraphenePlant();
        }
        if (settings.autoSmelter) {
            autoSmelter();
        }
        if (settings.autoAssembleGene) {
            autoAssembleGene();
        }
        if (settings.autoMinorTrait) {
            autoMinorTrait();
        }
        if (settings.prestigeType === "whitehole") {
            autoWhiteholePrestige();
        }
        if (settings.prestigeType === "bioseed") {
            autoSeederPrestige();
        }
        if (settings.prestigeType === "mad") {
            autoMadPrestige();
        }

        if (!massEjectorProcessed) {
            autoMassEjector(); // We do this at the start and end of the function. If eject all is required then this will occur at the start; otherwise process at the end
        }
    }

    function mainAutoEvolveScript() {
        // This is a hack to check that the entire page has actually loaded. The queueColumn is one of the last bits of the DOM
        // so if it is there then we are good to go. Otherwise, wait a little longer for the page to load.
        if (document.getElementById("queueColumn") === null) {
            setTimeout(mainAutoEvolveScript, 100);
            return;
        }
        // @ts-ignore
        if (typeof unsafeWindow !== 'undefined') {
            // @ts-ignore
            game = unsafeWindow.game;
        } else {
            // @ts-ignore
            game = window.game;
        }

        initialiseState();
        initialiseRaces();
        initialiseScript();
        initialiseWeightingRules();
        setInterval(automate, 1000);
    }

    //#endregion Main Loop

    //#region UI

    addScriptStyle();

    function addScriptStyle() {
        let styles = `
            .script-lastcolumn:after { float: right; content: "\\21c5"; }
            .ui-sortable-helper { display: table; }
            .script-draggable { cursor: move; cursor: grab; }
            tr:active, tr.ui-sortable-helper { cursor: grabbing !important; }

            .script-collapsible {
                background-color: #444;
                color: white;
                cursor: pointer;
                padding: 18px;
                width: 100%;
                border: none;
                text-align: left;
                outline: none;
                font-size: 15px;
            }

            .script-contentactive, .script-collapsible:hover {
                background-color: #333;
            }

            .script-collapsible:after {
                content: '\\002B';
                color: white;
                font-weight: bold;
                float: right;
                margin-left: 5px;
            }

            .script-contentactive:after {
                content: "\\2212";
            }

            .script-content {
                padding: 0 18px;
                display: none;
                //max-height: 0;
                overflow: hidden;
                //transition: max-height 0.2s ease-out;
                //background-color: #f1f1f1;
            }

            .script-searchsettings {
                width: 100%;
                margin-top: 20px;
                margin-bottom: 10px;
            }

            /* Open script options button */
            .s-options-button {
                padding-right: 2px;
                cursor: pointer;
            }

            /* The Modal (background) */
            .script-modal {
              display: none; /* Hidden by default */
              position: fixed; /* Stay in place */
              z-index: 100; /* Sit on top */
              left: 0;
              top: 0;
              width: 100%; /* Full width */
              height: 100%; /* Full height */
              background-color: rgb(0,0,0); /* Fallback color */
              background-color: rgba(10,10,10,.86); /* Blackish w/ opacity */
            }

            /* Modal Content/Box */
            .script-modal-content {
                position: relative;
                background-color: #1f2424;
                margin: auto;
                margin-top: 50px;
                margin-bottom: 50px;
                //margin-left: 10%;
                //margin-right: 10%;
                padding: 0px;
                //width: 80%;
                width: 900px;
                max-height: 90%;
                border-radius: .5rem;
                text-align: center;
            }

            /* The Close Button */
            .script-modal-close {
              float: right;
              font-size: 28px;
              margin-top: 20px;
              margin-right: 20px;
            }

            .script-modal-close:hover,
            .script-modal-close:focus {
              cursor: pointer;
            }

            /* Modal Header */
            .script-modal-header {
              padding: 4px 16px;
              margin-bottom: .5rem;
              border-bottom: #ccc solid .0625rem;
              text-align: center;
            }

            /* Modal Body */
            .script-modal-body {
                padding: 2px 16px;
                text-align: center;
                overflow: auto;
            }

            .ui-autocomplete {
                background-color: #000;
            }

            .ui-helper-hidden-accessible {
                display:none;
            }
        `

        // Create style document
        var css = document.createElement('style');
        css.type = 'text/css';
        css.appendChild(document.createTextNode(styles));

        // Append style to html head
        document.getElementsByTagName("head")[0].appendChild(css);
    }

    function removeScriptSettings() {
        $("#script_settings").remove();
    }

    function buildScriptSettings() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let scriptContentNode = $('<div id="script_settings" style="margin-top: 30px;"></div>');
        $("#localization").parent().append(scriptContentNode);
        let parentNode = $('#script_settings');
        parentNode.empty();

        buildImportExport();
        buildPrestigeSettings(parentNode, true);
        buildGeneralSettings();
        buildGovernmentSettings(parentNode, true);
        buildEvolutionSettings();
        buildMinorTraitSettings();
        buildTriggerSettings();
        buildResearchSettings();
        buildWarSettings(parentNode, true);
        buildHellSettings(parentNode, true);
        buildMarketSettings();
        buildStorageSettings();
        buildProductionSettings();
        buildJobSettings();
        buildBuildingSettings();
        buildWeightingSettings();
        buildProjectSettings();
        buildLoggingSettings(parentNode, true);

        let collapsibles = document.getElementsByClassName("script-collapsible");
        for (let i = 0; i < collapsibles.length; i++) {
            collapsibles[i].addEventListener("click", function() {
                this.classList.toggle("script-contentactive");
                let content = this.nextElementSibling;
                if (content.style.display === "block") {
                    settings[collapsibles[i].id] = true;
                    content.style.display = "none";

                    let search = content.getElementsByClassName("script-searchsettings");
                    if (search.length > 0) {
                        search[0].value = "";
                        filterBuildingSettingsTable();
                    }
                } else {
                    settings[collapsibles[i].id] = false;
                    content.style.display = "block";
                    content.style.height = null;
                    content.style.height = content.offsetHeight + "px";
                }

                updateSettingsFromState();
            });
        }

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildImportExport() {
        let importExportNode = $(".importExport").last();
        if (importExportNode === null) {
            return;
        }

        if (document.getElementById("script_settingsImport") !== null) {
            return;
        }

        importExportNode.append(' <button id="script_settingsImport" class="button">Import Script Settings</button>');

        $('#script_settingsImport').on("click", function() {
            if ($('#importExport').val().length > 0) {
                //let saveState = JSON.parse(LZString.decompressFromBase64($('#importExport').val()));
                let saveState = JSON.parse($('#importExport').val());
                if (saveState && 'scriptName' in saveState && saveState.scriptName === "TMVictor") {
                    console.log("Importing script settings");
                    settings = saveState;
                    state.triggerManager.clearPriorityList(); // Triggers are special. We save them directly onto the settings object.
                    updateStateFromSettings();
                    updateSettingsFromState();
                    $('#autoScriptContainer').remove();
                    updateSettingsUI();
                    $('#importExport').val("");
                }
            }
        });

        importExportNode.append(' <button id="script_settingsExport" class="button">Export Script Settings</button>');

        $('#script_settingsExport').on("click", function() {
            //$('#importExport').val(LZString.compressToBase64(JSON.stringify(global)));
            console.log("Exporting script settings")
            $('#importExport').val(JSON.stringify(settings));
            $('#importExport').select();
            document.execCommand('copy');
        });
    }

    function updateSettingsUI() {
        let parentNode = $("#script_settings");

        updateGeneralSettingsContent();
        updateGovernmentSettingsContent(true);
        updateEvolutionSettingsContent();
        updateMinorTraitSettingsContent();
        updateTriggerSettingsContent();
        updateResearchSettingsContent();
        updateWarSettingsContent(true);
        updateHellSettingsContent(true);
        updateMarketSettingsContent();
        updateStorageSettingsContent();
        updateProductionSettingsContent();
        updateJobSettingsContent();
        updateBuildingSettingsContent();
        updateWeightingSettingsContent();
        updateProjectSettingsContent();
        updateLoggingSettingsContent(true);
    }

    function buildSettingsSection(sectionId, sectionName, resetFunction, updateSettingsContentFunction) {
        let scriptContentNode = $("#script_settings");

        scriptContentNode.append(
            '<div id="script_' + sectionId + 'Settings" style="margin-top: 10px;">' +
                '<h3 id="' + sectionId + 'SettingsCollapsed" class="script-collapsible text-center has-text-success">' + sectionName + ' Settings</h3>' +
                '<div class="script-content">' +
                    '<div style="margin-top: 10px;"><button id="script_reset' + sectionId + '" class="button">Reset ' + sectionName + ' Settings</button></div>' +
                    '<div style="margin-top: 10px; margin-bottom: 10px;" id="script_' + sectionId + 'Content"></div>' +
                '</div>' +
            '</div>');

        updateSettingsContentFunction();

        if (!settings[sectionId + "SettingsCollapsed"]) {
            let element = document.getElementById(sectionId + "SettingsCollapsed");
            element.classList.toggle("script-contentactive");
            let content = element.nextElementSibling;
            //@ts-ignore
            content.style.display = "block";
        }

        $("#script_reset" + sectionId).on("click", function() {genericResetFunction(resetFunction, sectionName)});
    }

    function buildSettingsSection2(parentNode, isMainSettings, sectionId, sectionName, resetFunction, updateSettingsContentFunction) {
        let mainSectionId = sectionId;
        let computedSectionId = sectionId;
        let contentContainerNode = parentNode;

        if (!isMainSettings) {
            computedSectionId = "c_" + sectionId;
        }

        if (isMainSettings) {
            let headerNode = $(
                '<div id="script_' + mainSectionId + 'Settings" style="margin-top: 10px;">' +
                    '<h3 id="' + mainSectionId + 'SettingsCollapsed" class="script-collapsible text-center has-text-success">' + sectionName + ' Settings</h3>' +
                '</div>'
            );

            contentContainerNode = $(
                '<div class="script-content">' +
                    '<div style="margin-top: 10px;"><button id="script_reset' + mainSectionId + '" class="button">Reset ' + sectionName + ' Settings</button></div>' +
                '</div>'
            );

            headerNode.append(contentContainerNode);
            parentNode.append(headerNode);

            $("#script_reset" + mainSectionId).on("click", function() { genericResetFunction(resetFunction, sectionName) });
        }

        let contentNode = $('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_' + computedSectionId + 'Content"></div>');
        contentContainerNode.append(contentNode);

        updateSettingsContentFunction(isMainSettings);

        if (isMainSettings) {
            if (!settings[sectionId + "SettingsCollapsed"]) {
                let element = document.getElementById(mainSectionId + "SettingsCollapsed");
                element.classList.toggle("script-contentactive");
                let content = element.nextElementSibling;
                //@ts-ignore
                content.style.display = "block";
            }
        }
    }

    /**
     * @param {() => void} resetFunction
     * @param {string} sectionName
     */
    function genericResetFunction(resetFunction, sectionName) {
        let confirmation = confirm("Are you sure you wish to reset " + sectionName + " Settings?");
        if (confirmation) {
            resetFunction();
        }
    }

    /**
     * @param {{ append: (arg0: string) => void; }} node
     * @param {string} heading
     */
    function addStandardHeading(node, heading) {
        node.append('<div style="margin-top: 5px; width: 600px; display: inline-block;"><span class="has-text-danger" style="margin-left: 10px;">' + heading + '</span></div>')
    }

    /**
     * @param {{ append: (arg0: string) => void; }} node
     * @param {string} settingName
     * @param {string} labelText
     * @param {string} hintText
     */
    function addStandardSectionSettingsToggle(node, settingName, labelText, hintText) {
        node.append('<div style="margin-top: 5px; width: 600px; display: inline-block;"><label title="' + hintText + '" tabindex="0" class="switch" id="script_' + settingName + '"><input type="checkbox" value=false> <span class="check"></span><span style="margin-left: 10px;">' + labelText + '</span></label></div>')

        let toggleNode = $('#script_' + settingName + ' > input');
        if (settings[settingName]) {
            toggleNode.prop('checked', true);
        }

        toggleNode.on('change', function(e) {
            settings[settingName] = e.currentTarget.checked;
            updateSettingsFromState();
        });
    }

    /**
     * @param {{ append: (arg0: string) => void; }} node
     * @param {string} settingName
     * @param {string} labelText
     * @param {string} hintText
     */
    function addStandardSectionSettingsNumber(node, settingName, labelText, hintText) {
        node.append('<div style="margin-top: 5px; width: 500px; display: inline-block;"><label title="' + hintText + '" for="script_' + settingName + '">' + labelText + '</label><input id="script_' + settingName + '" type="text" class="input is-small" style="width: 150px; float: right;"></input></div>');

        let textBox = $('#script_' + settingName);
        textBox.val(settings[settingName]);

        textBox.on('change', function() {
            let parsedValue = getRealNumber(textBox.val());
            if (!isNaN(parsedValue)) {
                settings[settingName] = parsedValue;
                updateSettingsFromState();
            }
        });
    }

    /**
     * @param {{ append: (arg0: string) => void; }} node
     * @param {string} headerText
     */
    function addStandardSectionHeader1(node, headerText) {
        node.append(`<div style="margin: 4px; width: 100%; display: inline-block; text-align: left;"><span class="has-text-success" style="font-weight: bold;">${headerText}</span></div>`)
    }

    /**
     * @param {{ append: (arg0: string) => void; }} node
     * @param {string} headerText
     */
    function addStandardSectionHeader2(node, headerText) {
        node.append(`<div style="margin: 2px; width: 90%; display: inline-block; text-align: left;"><span class="has-text-caution">${headerText}</span></div>`)
    }

    /**
     * @param {string} secondaryPrefix
     * @param {{ append: (arg0: string) => void; }} node
     * @param {number} indent Indent level of this toggle - 0, 1, 2, etc.
     * @param {string} settingName
     * @param {string} labelText
     * @param {string} hintText
     */
    function addStandardSectionSettingsToggle2(secondaryPrefix, node, indent, settingName, labelText, hintText) {
        let mainSettingName = "script_" + settingName;
        let computedSettingName = "script_" + secondaryPrefix + settingName;
        let marginLeft = indent === 0 ? "" : `margin-left: ${indent * 30}px; `;
        node.append(`<div style="${marginLeft}margin-top: 5px; width: 80%; display: inline-block; text-align: left;"><label title="${hintText}" tabindex="0" class="switch" id="${computedSettingName}"><input type="checkbox"> <span class="check"></span><span style="margin-left: 10px;">${labelText}</span></label></div>`)

        let toggleNode = $(`#${computedSettingName} > input`);
        if (settings[settingName]) {
            toggleNode.prop('checked', true);
        }

        toggleNode.on('change', function(e) {
            settings[settingName] = e.currentTarget.checked;
            updateSettingsFromState();

            if (secondaryPrefix !== "" && settings.showSettings) {
                // @ts-ignore
                document.getElementById(mainSettingName).children[0].checked = e.currentTarget.checked;
            }
        });
    }

    /**
     * @param {string} secondaryPrefix
     * @param {{append: (arg0: string) => void;}} node
     * @param {number} indent Indent level of this toggle - 0, 1, 2, etc.
     * @param {string} settingName
     * @param {string} labelText
     * @param {string} hintText
     */
    function addStandardSectionSettingsNumber2(secondaryPrefix, node, indent, settingName, labelText, hintText) {
        let mainSettingName = "script_" + settingName;
        let computedSettingName = "script_" + secondaryPrefix + settingName;
        let marginLeft = indent === 0 ? "" : `margin-left: ${indent * 30}px; padding-right: 14px; `;
        node.append(`<div style="${marginLeft}display: inline-block; width: 80%; text-align: left;"><label title="${hintText}" for="${computedSettingName}">${labelText}</label><input id="${computedSettingName}" type="text" style="text-align: right; height: 18px; width: 150px; float: right;"></input></div>`);

        let textBox = $('#' + computedSettingName);
        textBox.val(settings[settingName]);

        textBox.on('change', function() {
            let parsedValue = getRealNumber(textBox.val());
            if (!isNaN(parsedValue)) {
                settings[settingName] = parsedValue;
                updateSettingsFromState();

                if (secondaryPrefix !== "" && settings.showSettings) {
                    let mainSetting = $('#' + mainSettingName);
                    mainSetting.val(settings[settingName]);
                }
            }
        });
    }

    /**
     * @param {Object} object
     * @param {string} settingKey
     * @param {string} property
     */
    function buildStandartSettingsInput(object, settingKey, property) {
        let textBox = $('<input type="text" class="input is-small" style="width:100%"/>');
        textBox.val(settings[settingKey]);

        textBox.on('change', function() {
            let val = textBox.val();
            let parsedValue = getRealNumber(val);
            if (!isNaN(parsedValue)) {
                object[property] = parsedValue;
                updateSettingsFromState();
            }
        });

        return textBox;
    }

    function buildStandartSettingsToggle(entity, property, toggleId, syncToggleId) {
        let checked = entity[property] ? " checked" : "";
        let toggle = $('<label id="' + toggleId + '" tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span></label>');

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = input.checked;
            entity[property] = state;

            if (syncToggleId) {
                let otherCheckbox = document.querySelector('#' + syncToggleId + ' input');
                if (otherCheckbox !== null) {
                    otherCheckbox.checked = state;
                }
            }
            updateSettingsFromState();
        });

        return toggle;
    }

    function buildStandartLabel(note, highlight) {
        let classAttribute = highlight ? ' class="has-text-danger"' : ' class="has-text-info"';
        let label = $('<span' + classAttribute + '">' + note + '</span>');
        return label;
    }

    function buildGeneralSettings() {
        let sectionId = "general";
        let sectionName = "General";

        let resetFunction = function() {
            resetGeneralSettings();
            updateSettingsFromState();
            updateGeneralSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateGeneralSettingsContent);
    }

    function updateGeneralSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_generalContent');
        currentNode.empty().off("*");

        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_generalPreTable"></div>');
        addStandardSectionSettingsToggle(preTableNode, "genesAssembleGeneAlways", "Always assemble genes", "Will continue assembling genes even after De Novo Sequencing is researched");
        addStandardSectionSettingsToggle(preTableNode, "buildingAlwaysClick", "Always autoclick resources", "By default script will click only during early stage of autoBuild, to bootstrap production. With this toggled on it will continue clicking forever");
        addStandardSectionSettingsNumber(preTableNode, "buildingClickPerTick", "Maximum clicks per second", "Number of clicks performed at once, each second. Hardcapped by amount of missed resources");

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildPrestigeSettings(parentNode, isMainSettings) {
        let sectionId = "prestige";
        let sectionName = "Prestige";

        let resetFunction = function() {
            resetPrestigeSettings();
            updateSettingsFromState();
            updatePrestigeSettingsContent(isMainSettings);
        };

        buildSettingsSection2(parentNode, isMainSettings, sectionId, sectionName, resetFunction, updatePrestigeSettingsContent);
    }

    function updatePrestigeSettingsContent(isMainSettings) {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;
        let secondaryPrefix = "c_";

        if (isMainSettings) {
            secondaryPrefix = "";
        }

        let currentNode = $(`#script_${secondaryPrefix}prestigeContent`);
        currentNode.empty().off("*");

        // Prestige panel
        let prestigeHeaderNode = $(`<div id="script_${secondaryPrefix}prestige"></div>`);
        currentNode.append(prestigeHeaderNode);

        let typeSelectNodeID = "script_" + secondaryPrefix + "prestigeType";
        prestigeHeaderNode.append(`<div style="display: inline-block; width: 80%; text-align: left; margin-bottom: 10px;">
                                      <label for="${typeSelectNodeID}">Prestige Type:</label>
                                      <select id="${typeSelectNodeID}" style="text-align: right; height: 18px; width: 150px; float: right;">
                                        <option value = "none">None</option>
                                        <option value = "mad" title = "MAD prestige once MAD has been researched and all soldiers are home">Mutual Assured Destruction</option>
                                        <option value = "bioseed" title = "Launches the bioseeder ship to perform prestige when required probes have been constructed">Bioseed</option>
                                        <option value = "whitehole" title = "Infuses the blackhole with exotic materials to perform prestige">Whitehole</option>
                                      </select>
                                    </div>`);
        let typeSelectNode = $("#" + typeSelectNodeID);

        typeSelectNode.val(settings.prestigeType);
        typeSelectNode.on('change', function(e) {
            // Special processing for prestige options. If they are ready to prestige then warn the user about enabling them.
            let confirmationText = "";
            if (this.value === "mad" && isResearchUnlocked("mad")) {
                confirmationText = "MAD has already been researched. This may MAD immediately. Are you sure you want to enable MAD prestige?";
            } else if (this.value === "bioseed" && isBioseederPrestigeAvailable()) {
                confirmationText = "Bioseeder ship is ready to launch and may launch immediately. Are you sure you want to enable bioseeder prestige?";
            } else if (this.value === "whitehole" && isWhiteholePrestigeAvailable()) {
                confirmationText = "Whitehole exotic infusion is ready and may prestige immediately. Are you sure you want to enable whitehole prestige?";
            }

            if (confirmationText !== "" && !confirm(confirmationText)) {
                this.value = "none";
            }

            if (!isMainSettings && settings.showSettings) {
                let mainSetting = $("#script_prestigeType");
                mainSetting.val(this.value);
            }

            settings.prestigeType = this.value;
            updateSettingsFromState();
        });

        // Bioseed
        addStandardSectionHeader1(prestigeHeaderNode, "Bioseed");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "autoSpace", "Construct Launch Facility", "Constructs the Launch Facility when it becomes available regardless of other settings");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeBioseedConstruct", "Constructs Bioseeder Ship Segments and Probes", "Construct the bioseeder ship segments and probes in preparation for bioseeding");
        addStandardSectionSettingsNumber2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeBioseedProbes", "Required probes", "Required number of probes before launching bioseeder ship");

        // Whitehole
        addStandardSectionHeader1(prestigeHeaderNode, "Whitehole");
        addStandardSectionSettingsNumber2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeWhiteholeMinMass", "Required minimum solar mass", "Required minimum solar mass of blackhole before prestiging");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeWhiteholeStabiliseMass", "Stabilise blackhole until minimum solar mass reached", "Stabilises the blackhole with exotic materials until minimum solar mass is reached");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeWhiteholeEjectEnabled", "Enable mass ejector", "If not enabled the mass ejector will not be managed by the script");
        addStandardSectionSettingsNumber2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeWhiteholeDecayRate", "(Decay Challenge) Eject rate", "Set amount of ejected resources up to this percent of decay rate. Only useful during Decay Challenge, normally only resources with full storages will be ejected, until below option is activated.");
        addStandardSectionSettingsNumber2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeWhiteholeEjectAllCount", "Eject everything once X mass ejectors constructed", "Once we've constructed X mass ejectors the eject as much of everything as possible");

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildGovernmentSettings(parentNode, isMainSettings) {
        let sectionId = "government";
        let sectionName = "Government";

        let resetFunction = function() {
            resetGovernmentSettings();
            updateSettingsFromState();
            updateGovernmentSettingsContent(isMainSettings);
        };

        buildSettingsSection2(parentNode, isMainSettings, sectionId, sectionName, resetFunction, updateGovernmentSettingsContent);
    }

    function updateGovernmentSettingsContent(isMainSettings) {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;
        let secondaryPrefix = "c_";

        if (isMainSettings) {
            secondaryPrefix = "";
        }

        let currentNode = $(`#script_${secondaryPrefix}governmentContent`);
        currentNode.empty().off("*");

        // Add any pre table settings
        let preTableNode = currentNode.append(`<div id="script_${secondaryPrefix}governmentPreTable"></div>`);
        addStandardSectionSettingsNumber2(secondaryPrefix, preTableNode, 0, "generalMinimumTaxRate", "Minimum allowed tax rate", "Minimum tax rate for autoTax. Will still go below this amount if money storage is full");
        addStandardSectionSettingsNumber2(secondaryPrefix, preTableNode, 0, "generalMinimumMorale", "Minimum allowed morale", "Use this to set a minimum allowed morale. Remember that less than 100% can cause riots and weather can cause sudden swings");
        addStandardSectionSettingsNumber2(secondaryPrefix, preTableNode, 0, "generalMaximumMorale", "Maximum allowed morale", "Use this to set a maximum allowed morale. The tax rate will be raised to lower morale to this maximum");

        addStandardSectionSettingsToggle2(secondaryPrefix, preTableNode, 0, "govManage", "Manage changes of government", "Manage changes of government when they become available");

        // Government selector
        buildGovernmentSelectorSetting(secondaryPrefix, preTableNode, "govInterim", "Interim Government", "Temporary low tier government until you research other governments");
        buildGovernmentSelectorSetting(secondaryPrefix, preTableNode, "govFinal", "Second Government", "Second government choice, chosen once becomes avaiable. Can be the same as above");
        buildGovernmentSelectorSetting(secondaryPrefix, preTableNode, "govSpace", "Space Government", "Government for bioseed+. Chosen once you researced Quantum Manufacturing. Can be the same as above");

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildGovernmentSelectorSetting(secondaryPrefix, parentNode, settingName, displayName, hintText) {
        let computedSelectId = `script_${secondaryPrefix}${settingName}`;
        let mainSelectId = `script_${settingName}`;
        let govNode = $(`<div style="margin-top: 5px; display: inline-block; width: 80%; text-align: left;"><label title="${hintText}" for="${computedSelectId}">${displayName}:</label><select id="${computedSelectId}" style="width: 150px; float: right;"></select></div>`);
        parentNode.append(govNode);

        let selectNode = $('#' + computedSelectId);

        Object.keys(governmentTypes).forEach(governmentKey => {
            // Anarchy is a starting government but not one that a player can choose
            if (governmentKey === governmentTypes.anarchy.id) {
                return;
            }

            let governmentType = governmentTypes[governmentKey];

            let selected = settings[settingName] === governmentType.id ? 'selected="selected"' : "";
            let optionNode = $(`<option value="${governmentType.id}" ${selected}>${governmentType.name()}</option>`);
            selectNode.append(optionNode);
        });

        selectNode.on('change', function() {
            let value = $(`#${computedSelectId} :selected`).val();
            settings[settingName] = value;
            updateSettingsFromState();

            if (secondaryPrefix !== "" && settings.showSettings) {
                // @ts-ignore
                document.getElementById(mainSelectId).value = settings[settingName];
            }
        });
    }

    function buildEvolutionSettings() {
        let sectionId = "evolution";
        let sectionName = "Evolution";

        let resetFunction = function() {
            resetEvolutionSettings();
            updateSettingsFromState();
            updateEvolutionSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateEvolutionSettingsContent);
    }

    function updateEvolutionSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_evolutionContent');
        currentNode.empty().off("*");

        // Target universe
        currentNode.append(`<div style="margin-top: 5px; width: 400px;">
                              <label for="script_userUniverseTargetName">Target Universe:</label>
                              <select id="script_userUniverseTargetName" style="width: 150px; float: right;">
                                <option value = "none">None</option>
                              </select>
                            </div>`);

        let selectNode = $('#script_userUniverseTargetName');

        universes.forEach(universeName => {
            selectNode.append('<option value = "' + universeName + '">' + universeName.charAt(0).toUpperCase() + universeName.slice(1) + '</option>');
        });
        selectNode.val(settings.userUniverseTargetName);

        selectNode.on('change', function() {
            let value = $("#script_userUniverseTargetName :selected").val();
            settings.userUniverseTargetName = value;
            updateSettingsFromState();
        });

        // Target planet
        currentNode.append(`<div style="margin-top: 5px; width: 400px;">
                              <label for="script_userPlanetTargetName">Target Planet:</label>
                              <select id="script_userPlanetTargetName" style="width: 150px; float: right;">
                                <option value = "none">None</option>
                                <option value = "habitable" title = "Picks most habitable planet, based on biome and trait">Most habitable</option>
                                <option value = "achieve" title = "Picks planet with most unearned achievements. Takes in account extinction achievements for planet exclusive races, and greatness achievements for planet biome, trait, and exclusive genus.">Most achievements</option>
                              </select>
                            </div>`);

        selectNode = $('#script_userPlanetTargetName');

        selectNode.val(settings.userPlanetTargetName);
        selectNode.on('change', function() {
            let value = $("#script_userPlanetTargetName :selected").val();
            settings.userPlanetTargetName = value;
            updateSettingsFromState();
        });

        // Target evolution
        currentNode.append(`<div style="margin-top: 5px; width: 400px;">
                              <label for="script_userEvolutionTarget">Target Evolution:</label>
                              <select id="script_userEvolutionTarget" style="width: 150px; float: right;">
                                <option value = "auto">Auto MAD Achievements</option>
                              </select>
                            </div><div><span id="script_race_warning"></span></div>`);

        selectNode = $('#script_userEvolutionTarget');

        for (let i = 0; i < raceAchievementList.length; i++) {
            let race = raceAchievementList[i];
            selectNode.append('<option value = "' + race.id + '">' + race.name + '</option>');
        }
        selectNode.val(settings.userEvolutionTarget);

        let race = races[settings.userEvolutionTarget];
        if (race && race.evolutionConditionText !== '') {
            $("#script_race_warning").html(`<span class="${race.evolutionCondition() ? "has-text-warning" : "has-text-danger"}">Warning! This race have special requirements: ${race.evolutionConditionText}. This condition is currently ${race.evolutionCondition() ? "met" : "not met"}.</span>`);
        }

        selectNode.on('change', function() {
            let value = $("#script_userEvolutionTarget :selected").val();
            settings.userEvolutionTarget = value;
            state.resetEvolutionTarget = true;
            updateSettingsFromState();

            let race = races[settings.userEvolutionTarget];
            if (race && race.evolutionConditionText !== '') {
                $("#script_race_warning").html(`<span class="${race.evolutionCondition() ? "has-text-warning" : "has-text-danger"}">Warning! This race have special requirements: ${race.evolutionConditionText}. This condition is currently ${race.evolutionCondition() ? "met" : "not met"}.</span>`);
            } else {
                $("#script_race_warning").empty();
            }
            let content = document.querySelector('#script_evolutionSettings .script-content');
            content.style.height = null;
            content.style.height = content.offsetHeight + "px"
        });

        addStandardSectionSettingsToggle(currentNode, "evolutionBackup", "Restore Backups", "If Auto Achievements enabled script will restore last backup if evolved as a race with already earned MAD achievement.");
        // Challenges
        addStandardSectionSettingsToggle(currentNode, "challenge_plasmid", "No Plasmids", "Challenge mode - no plasmids");
        addStandardSectionSettingsToggle(currentNode, "challenge_mastery", "Weak Mastery", "Challenge mode - weak mastery");
        addStandardSectionSettingsToggle(currentNode, "challenge_trade", "No Trade", "Challenge mode - no trade");
        addStandardSectionSettingsToggle(currentNode, "challenge_craft", "No Manual Crafting", "Challenge mode - no manual crafting");
        addStandardSectionSettingsToggle(currentNode, "challenge_crispr", "Reduced CRISPER", "Challenge mode - reduced CRISPER effects");
        addStandardSectionSettingsToggle(currentNode, "challenge_joyless", "Joyless", "Challenge mode - joyless");
        addStandardSectionSettingsToggle(currentNode, "challenge_decay", "Decay", "Challenge mode - decay");
        addStandardSectionSettingsToggle(currentNode, "challenge_steelen", "Steelen", "Challenge mode - steelen");
        addStandardSectionSettingsToggle(currentNode, "challenge_emfield", "EM Field", "Challenge mode - electromagnetic field disruption");
        addStandardSectionSettingsToggle(currentNode, "challenge_cataclysm", "Cataclysm", "Challenge mode - shattered world (no homeworld)");
        addStandardSectionSettingsToggle(currentNode, "challenge_junker", "Junker", "Challenge mode - junker");

        addStandardHeading(currentNode, "Evolution Queue");
        addStandardSectionSettingsToggle(currentNode, "evolutionQueueEnabled", "Queue Enabled", "When enabled script with evolve with queued settings, from top to bottom. During that script settings will be overriden with settings stored in queue. Queued target will be removed from list after evolution.");

        let addButton = $('<div style="margin-top: 10px;"><button id="script_evlution_add" class="button">Add New Evolution</button></div>');
        currentNode.append(addButton);
        $("#script_evlution_add").on("click", addEvolutionSetting);

        currentNode.append(
            `<table style="width:100%"><tr>
                    <th class="has-text-warning" style="width:15%">Race</th>
                    <th class="has-text-warning" style="width:80%">Settings</th>
                    <th style="width:5%"></th>
                </tr><tbody id="script_evolutionQueueTable" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_evolutionQueueTable');
        for (let i = 0; i < settings.evolutionQueue.length; i++) {
            tableBodyNode.append(buildEvolutionQueueItem(i));
        }

        $('#script_evolutionQueueTable').sortable( {
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                var $clone =  $(ui).clone();
                $clone .css('position','absolute');
                return $clone.get(0);
            },
            update: function() {
                let evolutionIds = $('#script_evolutionQueueTable').sortable('toArray', {attribute: 'value'});

                let sortedQueue = [];
                for (let i = 0; i < evolutionIds.length; i++) {
                    let id = parseInt(evolutionIds[i]);
                    sortedQueue.push(settings.evolutionQueue[id]);
                }
                settings.evolutionQueue = sortedQueue;
                updateSettingsFromState();
                updateEvolutionSettingsContent();
            },
        } );

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildEvolutionQueueItem(id) {
        let queuedEvolution = settings.evolutionQueue[id];

        let raceName = "";
        let nameClass = "";

        let race = races[queuedEvolution.userEvolutionTarget];
        if (race) {
            raceName = race.name;
            nameClass = "has-text-info";

            // Check if we can evolve intro it
            if (!race.evolutionCondition()) {
                nameClass = "has-text-danger";
            }
        } else if (queuedEvolution.userEvolutionTarget === "auto") {
            raceName = "Auto MAD Achievements";
            nameClass = "has-text-warning";
        } else {
            raceName = "Unrecognized race!";
            nameClass = "has-text-danger";
        }

        let queueNode = $(`<tr id="script_evolution_${id}" value="${id}" class="script-draggable">
                              <td style="width:15%"><span class="${nameClass}">${raceName}</span></td>
                              <td style="width:80%"><textarea class="textarea">${JSON.stringify(queuedEvolution, null, 4)}</textarea></td>
                              <td style="width:5%"><a class="button is-dark is-small"><span>X</span></a></td>
                          </tr>`);

        // Delete button
        queueNode.find(".button").on('click', function() {
            settings.evolutionQueue.splice(id, 1);
            updateSettingsFromState();
            updateEvolutionSettingsContent();

            let content = document.querySelector('#script_evolutionSettings .script-content');
            content.style.height = null;
            content.style.height = content.offsetHeight + "px"
        });


        // Settings textarea
        queueNode.find(".textarea").on('change', function() {
            try {
                let queuedEvolution = JSON.parse(this.value);
                settings.evolutionQueue[id] = queuedEvolution;
            } catch (error) {
                alert(error);
                settings.evolutionQueue.splice(id, 1);
            }
            updateSettingsFromState();
            updateEvolutionSettingsContent();

            let content = document.querySelector('#script_evolutionSettings .script-content');
            content.style.height = null;
            content.style.height = content.offsetHeight + "px"
        });

        return queueNode;
    }

    function addEvolutionSetting() {
        let queuedEvolution = {};
        for (let i = 0; i < evolutionSettingsToStore.length; i++){
            let settingName = evolutionSettingsToStore[i];
            let settingValue = settings[settingName];
            queuedEvolution[settingName] = settingValue;
        }

        let queueLength = settings.evolutionQueue.push(queuedEvolution);
        updateSettingsFromState();

        let tableBodyNode = $('#script_evolutionQueueTable');
        tableBodyNode.append(buildEvolutionQueueItem(queueLength-1));

        let content = document.querySelector('#script_evolutionSettings .script-content');
        content.style.height = null;
        content.style.height = content.offsetHeight + "px"
    }

    function buildTriggerSettings() {
        let sectionId = "trigger";
        let sectionName = "Trigger";

        let resetFunction = function() {
            resetTriggerSettings();
            resetTriggerState();
            updateSettingsFromState();
            updateTriggerSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateTriggerSettingsContent);
    }

    function updateTriggerSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_triggerContent');
        currentNode.empty().off("*");

        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_triggerPreTable"></div>');
        let addButton = $('<div style="margin-top: 10px;"><button id="script_trigger_add" class="button">Add New Trigger</button></div>');
        preTableNode.append(addButton);
        $("#script_trigger_add").on("click", addTriggerSetting);

        // TODO: This thing should be able to buy resources via regular trades, not only routes.
        addStandardSectionSettingsToggle(preTableNode, "triggerRequest", "Request missing resources", "Once trigger requirements are met, and you have enough storage, script will set the routes to import missing resources to complete task. autoMarket should be enabled for this to work.");

        // Add table
        currentNode.append(
            `<table style="width:100%">
                    <tr><th class="has-text-warning" colspan="3">Requirement</th><th class="has-text-warning" colspan="5">Action</th></tr>
                    <tr><th class="has-text-warning" style="width:16%">Type</th><th class="has-text-warning" style="width:18%">Id</th><th class="has-text-warning" style="width:11%">Count</th><th class="has-text-warning" style="width:16%">Type</th><th class="has-text-warning" style="width:18%">Id</th><th class="has-text-warning" style="width:11%">Count</th><th style="width:5%"></th><th style="width:5%"></th></tr>
                <tbody id="script_triggerTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_triggerTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < state.triggerManager.priorityList.length; i++) {
            const trigger = state.triggerManager.priorityList[i];
            let classAttribute = ' class="script-draggable"';
            newTableBodyText += '<tr id="script_trigger_' + trigger.seq + '" value="' + trigger.seq + '"' + classAttribute + '><td style="width:16%"></td><td style="width:18%"></td><td style="width:11%"></td><td style="width:16%"></td><td style="width:18%"></td><td style="width:11%"></td><td style="width:5%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        for (let i = 0; i < state.triggerManager.priorityList.length; i++) {
            const trigger = state.triggerManager.priorityList[i];

            buildTriggerRequirementType(trigger);
            buildTriggerRequirementId(trigger);
            buildTriggerRequirementCount(trigger);

            buildTriggerActionType(trigger);
            buildTriggerActionId(trigger);
            buildTriggerActionCount(trigger);

            buildTriggerSettingsColumn(trigger);
        }

        $('#script_triggerTableBody').sortable( {
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                var $clone =  $(ui).clone();
                $clone .css('position','absolute');
                return $clone.get(0);
            },
            update: function() {
                let triggerIds = $('#script_triggerTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < triggerIds.length; i++) {
                    const seq = parseInt(triggerIds[i]);
                    // Trigger has been dragged... Update all trigger priorities
                    state.triggerManager.getTrigger(seq).priority = i;
                }

                state.triggerManager.sortByPriority();
                updateSettingsFromState();
            },
        } );

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }


    function addTriggerSetting() {
        let trigger = state.triggerManager.AddTrigger("unlocked", "club", 0, "research", "club", 0);
        updateSettingsFromState();

        let tableBodyNode = $('#script_triggerTableBody');
        let newTableBodyText = "";

        let classAttribute = ' class="script-draggable"';
        newTableBodyText += '<tr id="script_trigger_' + trigger.seq + '" value="' + trigger.seq + '"' + classAttribute + '><td style="width:16%"></td><td style="width:18%"></td><td style="width:11%"></td><td style="width:16%"></td><td style="width:18%"></td><td style="width:11%"></td><td style="width:5%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>';

        tableBodyNode.append($(newTableBodyText));

        buildTriggerRequirementType(trigger);
        buildTriggerRequirementId(trigger);
        buildTriggerRequirementCount(trigger);

        buildTriggerActionType(trigger);
        buildTriggerActionId(trigger);
        buildTriggerActionCount(trigger);

        buildTriggerSettingsColumn(trigger);

        let content = document.querySelector('#script_triggerSettings .script-content');
        // @ts-ignore
        content.style.height = null;
        // @ts-ignore
        content.style.height = content.offsetHeight + "px"

        state.triggerManager.resetTargetTriggers();
    }

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerRequirementType(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq).children().eq(0);
        triggerElement.empty().off("*");

        // Requirement Type
        let typeSelectNode = $(`<select>
                                  <option value = "unlocked">Unlocked</option>
                                  <option value = "researched">Researched</option>
                                  <option value = "built">Built</option>
                                </select>`);
        typeSelectNode.val(trigger.requirementType);

        triggerElement.append(typeSelectNode);

        typeSelectNode.on('change', function() {
            trigger.updateRequirementType(this.value);
            state.triggerManager.resetTargetTriggers();

            buildTriggerRequirementId(trigger);
            buildTriggerRequirementCount(trigger);

            buildTriggerActionType(trigger);
            buildTriggerActionId(trigger);
            buildTriggerActionCount(trigger);

            updateSettingsFromState();
        });

        return;
    }

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerRequirementId(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq).children().eq(1);
        triggerElement.empty().off("*");

        if (trigger.requirementType === "researched" || trigger.requirementType === "unlocked") {
            triggerElement.append(buildTriggerTechInput(trigger, "requirementId"));
        }
        if (trigger.requirementType === "built") {
            triggerElement.append(buildTriggerBuildingInput(trigger, "requirementId"));
        }
    }

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerRequirementCount(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq).children().eq(2);
        triggerElement.empty().off("*");

        if (trigger.requirementType === "built") {
            triggerElement.append(buildTriggerCountInput(trigger, "requirementCount"));
        }
    }

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerActionType(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq).children().eq(3);
        triggerElement.empty().off("*");

        // Action Type
        let typeSelectNode = $(`<select>
                                  <option value = "research">Research</option>
                                  <option value = "build">Build</option>
                                </select>`);
        typeSelectNode.val(trigger.actionType);

        triggerElement.append(typeSelectNode);

        typeSelectNode.on('change', function() {
            trigger.updateActionType(this.value);
            state.triggerManager.resetTargetTriggers();

            buildTriggerActionId(trigger);
            buildTriggerActionCount(trigger);

            updateSettingsFromState();
        });

        return;
    }

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerActionId(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq).children().eq(4);
        triggerElement.empty().off("*");

        if (trigger.actionType === "research") {
            let inputElement = buildTriggerTechInput(trigger, "actionId");
            triggerElement.append(inputElement);
        }
        if (trigger.actionType === "build") {
            triggerElement.append(buildTriggerBuildingInput(trigger, "actionId"));
        }
    }

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerActionCount(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq).children().eq(5);
        triggerElement.empty().off("*");

        if (trigger.actionType === "build") {
            triggerElement.append(buildTriggerCountInput(trigger, "actionCount"));
        }
    }

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerSettingsColumn(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq).children().eq(6);
        triggerElement.empty().off("*");

        let deleteTriggerButton = $('<a class="button is-dark is-small"><span>X</span></a>');
        triggerElement.append(deleteTriggerButton);
        deleteTriggerButton.on('click', function() {
            state.triggerManager.RemoveTrigger(trigger.seq);
            updateSettingsFromState();
            updateTriggerSettingsContent();
            state.triggerManager.resetTargetTriggers();

            let content = document.querySelector('#script_triggerSettings .script-content');
            // @ts-ignore
            content.style.height = null;
            // @ts-ignore
            content.style.height = content.offsetHeight + "px"
        });
    }

    function buildTriggerTechInput(trigger, property){
        let typeSelectNode = $('<input style ="width:100%"></input>');

        // Event handler
        let onChange = function(event, ui) {
            event.preventDefault();

            // If it wasn't selected from list
            if(ui.item === null){
                let typedTech = Object.values(tech).find(technology => technology.title === this.value);
                if (typedTech !== undefined){
                    ui.item = {label: this.value, value: typedTech.id};
                }
            }

            // We have a tech to switch
            if (ui.item !== null && tech.hasOwnProperty(ui.item.value)) {
                if (trigger[property] === ui.item.value) {
                    return;
                }

                trigger[property] = ui.item.value;
                trigger.complete = false;

                state.triggerManager.resetTargetTriggers();
                updateSettingsFromState();

                this.value = ui.item.label;
                return;
            }

            // No tech selected, don't change trigger, just restore old title in text field
            if (tech.hasOwnProperty(trigger[property])) {
                this.value = tech[trigger[property]].title;
                return;
            }
        };

        typeSelectNode.autocomplete({
            delay: 0,
            source: function(request, response) {
            let matcher = new RegExp($.ui.autocomplete.escapeRegex(request.term), "i" );
            let techList = [];
            Object.values(tech).forEach(technology => {
                let title = technology.title;
                if(matcher.test(title)){
                    techList.push({label: title, value: technology.id});
                }
            });
            response(techList);
            },
            select: onChange, // Dropdown list click
            focus: onChange, // Arrow keys press
            change: onChange // Keyboard type
        });

        if (tech.hasOwnProperty(trigger[property])) {
            typeSelectNode.val(tech[trigger[property]].title);
        }

        return typeSelectNode;
    }

    function buildTriggerBuildingInput(trigger, property){
        let typeSelectNode = $('<input style ="width:100%"></input>');

        // Event handler
        let onChange = function(event, ui) {
            event.preventDefault();

            // If it wasn't selected from list
            if(ui.item === null){
                let typedBuilding = Object.values(buildingIds).find(building => building.name === this.value);
                if (typedBuilding !== undefined){
                    ui.item = {label: this.value, value: typedBuilding.settingId};
                }
            }

            // We have a building to switch
            if (ui.item !== null && buildingIds.hasOwnProperty(ui.item.value)) {
                if (trigger[property] === ui.item.value) {
                    return;
                }

                trigger[property] = ui.item.value;
                trigger.complete = false;

                state.triggerManager.resetTargetTriggers();
                updateSettingsFromState();

                this.value = ui.item.label;
                return;
            }

            // No building selected, don't change trigger, just restore old name in text field
            if (buildingIds.hasOwnProperty(trigger[property])) {
                this.value = buildingIds[trigger[property]].name;
                return;
            }
        };

        typeSelectNode.autocomplete({
            delay: 0,
            source: function(request, response) {
            let matcher = new RegExp($.ui.autocomplete.escapeRegex(request.term), "i" );
            let buildingList = [];
            Object.values(buildingIds).forEach(building => {
                let name = building.name;
                if(matcher.test(name)){
                    buildingList.push({label: name, value: building.settingId});
                }
            });
            response(buildingList);
            },
            select: onChange, // Dropdown list click
            focus: onChange, // Arrow keys press
            change: onChange // Keyboard type
        });

        if (buildingIds.hasOwnProperty(trigger[property])) {
            typeSelectNode.val(buildingIds[trigger[property]].name);
        }

        return typeSelectNode;
    }

    function buildTriggerCountInput(trigger, property) {
        let textBox = $('<input type="text" class="input is-small" style="width:100%"/>');
        textBox.val(trigger[property]);

        textBox.on('change', function() {
            let val = textBox.val();
            let parsedValue = getRealNumber(val);
            if (!isNaN(parsedValue)) {
                trigger[property] = parsedValue;
                trigger.complete = false;

                state.triggerManager.resetTargetTriggers();
                updateSettingsFromState();
            }
        });

        return textBox;
    }

    function buildResearchSettings() {
        let sectionId = "research";
        let sectionName = "Research";

        let resetFunction = function() {
            resetResearchSettings();
            updateSettingsFromState();
            updateResearchSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateResearchSettingsContent);
    }

    function updateResearchSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_researchContent');
        currentNode.empty().off("*");

        // Theology 1
        let theology1Node = $('<div style="margin-top: 5px; width: 400px"><label for="script_userResearchTheology_1">Target Theology 1:</label><select id="script_userResearchTheology_1" style="width: 150px; float: right;"></select></div>');
        currentNode.append(theology1Node);

        let selectNode = $('#script_userResearchTheology_1');
        let selected = settings.userResearchTheology_1 === "auto" ? ' selected="selected"' : "";
        let optionNode = $('<option value = "auto"' + selected + '>Script Managed</option>');
        selectNode.append(optionNode);

        selected = settings.userResearchTheology_1 === "tech-anthropology" ? ' selected="selected"' : "";
        optionNode = $('<option value = "tech-anthropology"' + selected + '>Anthropology</option>');
        selectNode.append(optionNode);

        selected = settings.userResearchTheology_1 === "tech-fanaticism" ? ' selected="selected"' : "";
        optionNode = $('<option value = "tech-fanaticism"' + selected + '>Fanaticism</option>');
        selectNode.append(optionNode);

        selectNode.on('change', function() {
            let value = $("#script_userResearchTheology_1 :selected").val();
            settings.userResearchTheology_1 = value;
            updateSettingsFromState();
            //console.log("Chosen theology 1 target of " + value);
        });

        // Theology 2
        let theology2Node = $('<div style="margin-top: 5px; width: 400px"><label for="script_userResearchTheology_2">Target Theology 2:</label><select id="script_userResearchTheology_2" style="width: 150px; float: right;"></select></div>');
        currentNode.append(theology2Node);

        selectNode = $('#script_userResearchTheology_2');
        selected = settings.userResearchTheology_2 === "auto" ? ' selected="selected"' : "";
        optionNode = $('<option value = "auto"' + selected + '>Script Managed</option>');
        selectNode.append(optionNode);

        selected = settings.userResearchTheology_2 === "tech-study" ? ' selected="selected"' : "";
        optionNode = $('<option value = "tech-study"' + selected + '>Study</option>');
        selectNode.append(optionNode);

        selected = settings.userResearchTheology_2 === "tech-deify" ? ' selected="selected"' : "";
        optionNode = $('<option value = "tech-deify"' + selected + '>Deify</option>');
        selectNode.append(optionNode);

        selectNode.on('change', function() {
            let value = $("#script_userResearchTheology_2 :selected").val();
            settings.userResearchTheology_2 = value;
            updateSettingsFromState();
            //console.log("Chosen theology 2 target of " + value);
        });

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildWarSettings(parentNode, isMainSettings) {
        let sectionId = "war";
        let sectionName = "Foreign Affairs";

        let resetFunction = function() {
            resetWarSettings();
            resetWarState();
            updateSettingsFromState();
            updateWarSettingsContent(isMainSettings);
        };

        buildSettingsSection2(parentNode, isMainSettings, sectionId, sectionName, resetFunction, updateWarSettingsContent);
    }

    function updateWarSettingsContent(isMainSettings) {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;
        let secondaryPrefix = "c_";

        if (isMainSettings) {
            secondaryPrefix = "";
        }

        let currentNode = $(`#script_${secondaryPrefix}warContent`);
        currentNode.empty().off("*");

        // Foreign powers panel
        let foreignPowerNode = $(`<div id="script_${secondaryPrefix}foreignPowers"></div>`);
        currentNode.append(foreignPowerNode);

        addStandardSectionHeader1(foreignPowerNode, "Foreign Powers");
        addStandardSectionSettingsToggle2(secondaryPrefix, foreignPowerNode, 0, "foreignPacifist", "Pacifist", "Turns attacks off and on");

        addStandardSectionSettingsToggle2(secondaryPrefix, foreignPowerNode, 0, "foreignUnification", "Perform unification", "Perform unification once all three powers are subdued. autoResearch should be enabled for this to work.");
        addStandardSectionSettingsToggle2(secondaryPrefix, foreignPowerNode, 0, "foreignOccupyLast", "Occupy last foreign power", "Occupy last foreign power once other two are subdued, and unification is researched. That can speed up unification, if you don't need unification achievements");

        addStandardSectionSettingsToggle2(secondaryPrefix, foreignPowerNode, 0, "foreignTrainSpy", "Train spies", "Train spies to use against foreign powers");
        addStandardSectionSettingsNumber2(secondaryPrefix, foreignPowerNode, 0, "foreignSpyMax", "Maximum spies", "Maximum spies per foreign power");

        addStandardSectionSettingsNumber2(secondaryPrefix, foreignPowerNode, 0, "foreignPowerRequired", "Military Power to switch target", "Switches to attack next foreign power once its power lowered down to this number. When exact numbers not know script tries to approximate it. `weak` power will be recognized as ≤75, and such. Thus, it's not recomended to set it down to 50, unless you'll increase amount of spies, to ensure you'll still see that exact value even when one of your spies is captured on mission.");

        let policyOptions = ["Ignore", "Influence", "Sabotage", "Incite", "Annex", "Purchase", "Occupy"];
        buildStandartSettingsSelector2(secondaryPrefix, foreignPowerNode, "foreignPolicyInferior", "Inferior Power", "Perform this against inferior foreign power, with military power equal or below given threshold. Complex actions includes required preparation - Annex and Purchase will incite and influence, Occupy will sabotage, until said options will be available.", policyOptions);
        buildStandartSettingsSelector2(secondaryPrefix, foreignPowerNode, "foreignPolicySuperior", "Superior Power", "Perform this against superior foreign power, with military power above given threshold. Complex actions includes required preparation - Annex and Purchase will incite and influence, Occupy will sabotage, until said options will be available.", policyOptions);
        addStandardSectionSettingsToggle2(secondaryPrefix, foreignPowerNode, 0, "foreignForceSabotage", "Sabotage foreign power when useful", "Perform sabotage against current target if it's useful(power above 50), regardless of required power, and default action defined above");

        // Campaign panel
        addStandardSectionHeader1(currentNode, "Campaigns");
        addStandardSectionSettingsNumber2(secondaryPrefix, currentNode, 0, "foreignAttackLivingSoldiersPercent", "Attack only if at least this percentage of your garrison soldiers are alive", "Only attacks if you ALSO have the target battalion size of healthy soldiers available, so this setting will only take effect if your battalion does not include all of your soldiers");
        addStandardSectionSettingsNumber2(secondaryPrefix, currentNode, 0, "foreignAttackHealthySoldiersPercent", "... and at least this percentage of your garrison is not injured", "Set to less than 100 to take advantage of being able to heal more soldiers in a game day than get wounded in a typical attack");
        addStandardSectionSettingsNumber2(secondaryPrefix, currentNode, 0, "foreignHireMercMoneyStoragePercent", "Hire mercenary if money storage greater than percent", "Hire a mercenary if money storage is greater than this percent");
        addStandardSectionSettingsNumber2(secondaryPrefix, currentNode, 0, "foreignHireMercCostLowerThan", "AND if cost lower than amount", "Combines with the money storage percent setting to determine when to hire mercenaries");

        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:20%">Campaign</th><th class="has-text-warning" style="width:40%">Minimum Attack Rating</th><th class="has-text-warning" style="width:40%">Maximum Rating to Send</th></tr>
                <tbody id="script_${secondaryPrefix}warTableBody" class="script-contenttbody"></tbody>
            </table>`);

        let warTableBody = $(`#script_${secondaryPrefix}warTableBody`);
        let newTableBodyText = "";

        for (let i = 0; i < state.warManager.campaignList.length; i++) {
            const campaign = state.warManager.campaignList[i];
            newTableBodyText += `<tr value="${campaign.id}"><td id="script_${secondaryPrefix}${campaign.id}Toggle" style="width:20%"></td><td style="width:40%"></td><td style="width:40%"></td></tr>`;
        }
        warTableBody.append($(newTableBodyText));

        // Build campaign settings rows
        for (let i = 0; i < state.warManager.campaignList.length; i++) {
            const campaign = state.warManager.campaignList[i];
            let warElement = $(`#script_${secondaryPrefix}${campaign.id}Toggle`);

            warElement.append(buildStandartLabel(campaign.name));

            warElement = warElement.next();
            warElement.append(buildCampaignRatingSettingsInput(secondaryPrefix, campaign));

            warElement = warElement.next();
            warElement.append(buildCampaignMaxRatingSettingsInput(secondaryPrefix, campaign));
        }

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildStandartSettingsSelector2(secondaryPrefix, parentNode, settingName, displayName, hintText, optionsList) {
        let computedSelectId = `script_${secondaryPrefix}${settingName}`;
        let mainSelectId = `script_${settingName}`;
        let div = $(`<div style="margin-top: 5px; display: inline-block; width: 80%; text-align: left;"><label title="${hintText}" for="${computedSelectId}">${displayName}:</label><select id="${computedSelectId}" style="width: 150px; float: right;"></select></div>`);
        parentNode.append(div);

        let selectNode = $('#' + computedSelectId);

        for (var i = 0; i < optionsList.length; i++) {
            let value = optionsList[i];
            let selected = settings[settingName] === optionsList[i] ? ' selected="selected"' : "";
            let optionNode = $(`<option value="${optionsList[i]}" ${selected}>${optionsList[i]}</option>`);
            selectNode.append(optionNode);
        }

        selectNode.on('change', function() {
            let value = $(`#${computedSelectId} :selected`).val();
            settings[settingName] = value;
            updateSettingsFromState();

            if (secondaryPrefix !== "" && settings.showSettings) {
                // @ts-ignore
                document.getElementById(mainSelectId).value = settings[settingName];
            }
        });
    }

    /**
     * @param {Campaign} campaign
     */
    function buildCampaignRatingSettingsInput(secondaryPrefix, campaign) {
        let mainSettingName = "script_" + campaign.id + "rating";
        let computedSettingName = "script_" + secondaryPrefix + campaign.id + "rating";
        let campaignMaxTextBox = $(`<input id="${computedSettingName}" type="text" style="text-align: right; height: 18px; width: 25%;"/>`);
        campaignMaxTextBox.val(settings["btl_" + campaign.id]);

        campaignMaxTextBox.on('change', function() {
            let val = campaignMaxTextBox.val();
            let rating = getRealNumber(val);
            if (!isNaN(rating)) {
                //console.log('Setting max for war ' + war.name + ' to be ' + max);
                campaign.rating = rating;
                updateSettingsFromState();

                if (secondaryPrefix !== "" && settings.showSettings) {
                    let mainSetting = $('#' + mainSettingName);
                    mainSetting.val(rating);
                }
            }
        });

        return campaignMaxTextBox;
    }

    /**
     * @param {Campaign} campaign
     */
    function buildCampaignMaxRatingSettingsInput(secondaryPrefix, campaign) {
        let mainSettingName = "script_" + campaign.id + "maxRating";
        let computedSettingName = "script_" + secondaryPrefix + campaign.id + "maxRating";
        let campaignMaxTextBox = $(`<input id="${computedSettingName}" type="text" style="text-align: right; height: 18px; width: 25%;"/>`);
        campaignMaxTextBox.val(settings["btl_max_" + campaign.id]);

        campaignMaxTextBox.on('change', function() {
            let val = campaignMaxTextBox.val();
            let rating = getRealNumber(val);
            if (!isNaN(rating)) {
                //console.log('Setting max for war ' + war.name + ' to be ' + max);
                campaign.maxRating = rating;
                updateSettingsFromState();

                if (secondaryPrefix !== "" && settings.showSettings) {
                    let mainSetting = $('#' + mainSettingName);
                    mainSetting.val(rating);
                }
            }
        });

        return campaignMaxTextBox;
    }

    function buildHellSettings(parentNode, isMainSettings) {
        let sectionId = "hell";
        let sectionName = "Hell";

        let resetFunction = function() {
            resetHellSettings();
            updateSettingsFromState();
            updateHellSettingsContent(isMainSettings);
        };

        buildSettingsSection2(parentNode, isMainSettings, sectionId, sectionName, resetFunction, updateHellSettingsContent);
    }

    function updateHellSettingsContent(isMainSettings) {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;
        let secondaryPrefix = "c_";

        if (isMainSettings) {
            secondaryPrefix = "";
        }

        let currentNode = $(`#script_${secondaryPrefix}hellContent`);
        currentNode.empty().off("*");

        // Hell panel
        let hellHeaderNode = $(`<div id="script_${secondaryPrefix}hell"></div>`);
        currentNode.append(hellHeaderNode);

        // Entering Hell
        addStandardSectionHeader1(hellHeaderNode, "Entering Hell");
        addStandardSectionSettingsToggle2(secondaryPrefix, hellHeaderNode, 0, "hellTurnOffLogMessages", "Turn off patrol and surveyor log messages", "Automatically turns off the hell patrol and surveyor log messages");
        addStandardSectionSettingsToggle2(secondaryPrefix, hellHeaderNode, 0, "hellHandlePatrolCount", "Automatically enter hell and adjust patrol count and hell garrison size", "Sets patrol count according to required garrison and patrol size");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 0, "hellHomeGarrison", "Soldiers to stay out of hell", "Home garrison maximum");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 0, "hellMinSoldiers", "Minimum soldiers to be available for hell (pull out if below)", "Don't enter hell if not enough soldiers, or get out if already in");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 0, "hellMinSoldiersPercent", "Alive soldier percentage for entering hell", "Don't enter hell if too many soldiers are dead, but don't get out");

        // Hell Garrison
        addStandardSectionHeader1(hellHeaderNode, "Hell Garrison");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 0, "hellTargetFortressDamage", "Target wall damage per siege (overestimates threat)", "Actual damage will usually be lower due to patrols and drones");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 0, "hellLowWallsMulti", "Garrison bolster factor for damaged walls", "Multiplies target defense rating by this when close to 0 wall integrity, half as much increase at half integrity");

        // Patrol size
        addStandardSectionHeader1(hellHeaderNode, "Patrol Size");
        addStandardSectionSettingsToggle2(secondaryPrefix, hellHeaderNode, 0, "hellHandlePatrolSize", "Automatically adjust patrol size", "Sets patrol attack rating based on current threat, lowers it depending on buildings, increases it to the minimum rating, and finally increases it based on dead soldiers. Handling patrol count has to be turned on.");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 0, "hellPatrolMinRating", "Minimum patrol attack rating", "Will never go below this");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 0, "hellPatrolThreatPercent", "Percent of current threat as base patrol rating", "Demon encounters have a rating of 2 to 10 percent of current threat");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 1, "hellPatrolDroneMod", "Lower Rating for each active Predator Drone by", "Predators reduce threat before patrols fight");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 1, "hellPatrolDroidMod", "Lower Rating for each active War Droid by", "War Droids boost patrol attack rating by 1 or 2 soldiers depending on tech");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 1, "hellPatrolBootcampMod", "Lower Rating for each Bootcamp by", "Bootcamps help regenerate soldiers faster");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 0, "hellBolsterPatrolRating", "Increase patrol rating by up to this when soldiers die", "Larger patrols are less effective, but also have fewer deaths");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 1, "hellBolsterPatrolPercentTop", "Start increasing patrol rating at this home garrison fill percent", "This is the higher number");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 1, "hellBolsterPatrolPercentBottom", "Full patrol rating increase below this home garrison fill percent", "This is the lower number");

        // Attractors
        addStandardSectionHeader1(hellHeaderNode, "Attractors");
        addStandardSectionSettingsToggle2(secondaryPrefix, hellHeaderNode, 0, "hellHandleAttractors", "Adapt how many Attractors Auto Power can turn on based on threat", "Auto Power needs to be on for this to work");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 1, "hellAttractorBottomThreat", "All Attractors on below this threat", "Turn more and more attractors off when getting nearer to the top threat");
        addStandardSectionSettingsNumber2(secondaryPrefix, hellHeaderNode, 1, "hellAttractorTopThreat", "All Attractors off above this threat", "Turn more and more attractors off when getting nearer to the top threat");

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildMarketSettings() {
        let sectionId = "market";
        let sectionName = "Market";

        let resetFunction = function() {
            resetMarketState();
            resetMarketSettings();
            updateSettingsFromState();
            updateMarketSettingsContent();

            // Redraw toggles on market tab
            if ( $('.ea-market-toggle').length !== 0 ) {
              removeMarketToggles();
              createMarketToggles();
            }
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateMarketSettingsContent);
    }

    function updateMarketSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_marketContent');
        currentNode.empty().off("*");

        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_marketPreTable"></div>');
        addStandardSectionSettingsToggle(preTableNode, "queueRequest", "Request resources for queue", "Automatically set routes to import resources missing by buildings in queue");
        addStandardSectionSettingsNumber(preTableNode, "tradeRouteMinimumMoneyPerSecond", "Trade minimum money /s", "Uses the highest per second amount of these two values. Will trade for resources until this minimum money per second amount is hit");
        addStandardSectionSettingsNumber(preTableNode, "tradeRouteMinimumMoneyPercentage", "Trade minimum money percentage /s", "Uses the highest per second amount of these two values. Will trade for resources until this percentage of your money per second amount is hit");

        // Add table
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:15%">Resource</th><th class="has-text-warning" style="width:10%">Buy</th><th class="has-text-warning" style="width:10%">Ratio</th><th class="has-text-warning" style="width:10%">Sell</th><th class="has-text-warning" style="width:10%">Ratio</th><th class="has-text-warning" style="width:10%">Trade For</th><th class="has-text-warning" style="width:10%">Routes</th><th class="has-text-warning" style="width:10%">Trade Away</th><th class="has-text-warning" style="width:10%">Min p/s</th><th style="width:5%"></th></tr>
                <tbody id="script_marketTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_marketTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < state.marketManager.priorityList.length; i++) {
            const resource = state.marketManager.priorityList[i];
            let classAttribute = ' class="script-draggable"';
            newTableBodyText += '<tr value="' + resource.id + '"' + classAttribute + '><td id="script_market_' + resource.id + 'Toggle" style="width:15%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:5%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other markets settings rows
        for (let i = 0; i < state.marketManager.priorityList.length; i++) {
            const resource = state.marketManager.priorityList[i];
            let marketElement = $('#script_market_' + resource.id + 'Toggle');

            marketElement.append(buildStandartLabel(resource.name));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsToggle(resource, "autoBuyEnabled", "script_buy2_" + resource.id, "script_buy1_" + resource.id));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsInput(resource, "res_buy_r_" + resource.id, "autoBuyRatio"));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsToggle(resource, "autoSellEnabled", "script_sell2_" + resource.id, "script_sell1_" + resource.id));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsInput(resource, "res_sell_r_" + resource.id, "autoSellRatio"));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsToggle(resource, "autoTradeBuyEnabled", "script_tbuy2_" + resource.id, "script_tbuy1_" + resource.id));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsInput(resource, "res_trade_buy_mtr_" + resource.id, "autoTradeBuyRoutes"));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsToggle(resource, "autoTradeSellEnabled", "script_tsell2_" + resource.id, "script_tsell1_" + resource.id));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsInput(resource, "res_trade_sell_mps_" + resource.id, "autoTradeSellMinPerSecond"));

            marketElement = marketElement.next();
            marketElement.append($('<span class="script-lastcolumn"></span>'));
        }

        $('#script_marketTableBody').sortable( {
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                var $clone =  $(ui).clone();
                $clone .css('position','absolute');
                return $clone.get(0);
            },
            update: function() {
                let marketIds = $('#script_marketTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < marketIds.length; i++) {
                    // Market has been dragged... Update all market priorities
                    state.marketManager.priorityList.find(resource => resource.id === marketIds[i]).marketPriority = i;
                }

                state.marketManager.sortByPriority();
                updateSettingsFromState();
            },
        } );

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildStorageSettings() {
        let sectionId = "storage";
        let sectionName = "Storage";

        let resetFunction = function() {
            resetStorageState();
            resetStorageSettings();
            updateSettingsFromState();
            updateStorageSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateStorageSettingsContent);
    }

    function updateStorageSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_storageContent');
        currentNode.empty().off("*");

        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_storagePreTable"></div>');
        addStandardSectionSettingsToggle(preTableNode, "storageLimitPreMad", "Limit Pre-MAD Storage", "Saves resources and shortens run time by limiting storage pre-MAD");
        addStandardSectionSettingsToggle(preTableNode, "storageSafeReassign", "Reassign only empty storages", "Wait until storage is empty before reassigning containers to another resource, to prevent overflowing and wasting resources");

        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:35%">Resource</th><th class="has-text-warning" style="width:15%">Enabled</th><th class="has-text-warning" style="width:15%">Store Overflow</th><th class="has-text-warning" style="width:15%">Max Crates</th><th class="has-text-warning" style="width:15%">Max Containers</th><th style="width:5%"></th></tr>
                <tbody id="script_storageTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_storageTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < state.storageManager.priorityList.length; i++) {
            const resource = state.storageManager.priorityList[i];
            let classAttribute = ' class="script-draggable"';
            newTableBodyText += '<tr value="' + resource.id + '"' + classAttribute + '><td id="script_storage_' + resource.id + 'Toggle" style="width:50%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other storages settings rows
        for (let i = 0; i < state.storageManager.priorityList.length; i++) {
            const resource = state.storageManager.priorityList[i];
            let storageElement = $('#script_storage_' + resource.id + 'Toggle');

            storageElement.append(buildStandartLabel(resource.name));

            storageElement = storageElement.next();
            storageElement.append(buildStandartSettingsToggle(resource, "autoStorageEnabled", "script_res_storage_" + resource.id));

            storageElement = storageElement.next();
            storageElement.append(buildStandartSettingsToggle(resource, "storeOverflow", "script_res_overflow_" + resource.id));

            storageElement = storageElement.next();
            storageElement.append(buildStandartSettingsInput(resource, "res_crates_m_" + resource.id, "_autoCratesMax"));

            storageElement = storageElement.next();
            storageElement.append(buildStandartSettingsInput(resource, "res_containers_m_" + resource.id, "_autoContainersMax"));
        }

        $('#script_storageTableBody').sortable( {
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                var $clone =  $(ui).clone();
                $clone .css('position','absolute');
                return $clone.get(0);
            },
            update: function() {
                let storageIds = $('#script_storageTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < storageIds.length; i++) {
                    // Storage has been dragged... Update all storage priorities
                    state.storageManager.priorityList.find(resource => resource.id === storageIds[i]).storagePriority = i;
                }

                state.storageManager.sortByPriority();
                updateSettingsFromState();
            },
        } );

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildMinorTraitSettings() {
        let sectionId = "minorTrait";
        let sectionName = "Minor Trait";

        let resetFunction = function() {
            resetMinorTraitState();
            resetMinorTraitSettings();
            updateSettingsFromState();
            updateMinorTraitSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateMinorTraitSettingsContent);
    }

    function updateMinorTraitSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_minorTraitContent');
        currentNode.empty().off("*");

        updateMinorTraitTable();

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function updateMinorTraitTable() {
        let currentNode = $('#script_minorTraitContent');
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:20%">Minor Trait</th><th class="has-text-warning" style="width:20%">Enabled</th><th class="has-text-warning" style="width:20%">Weighting</th><th class="has-text-warning" style="width:40%"></th></tr>
                <tbody id="script_minorTraitTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_minorTraitTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < state.minorTraitManager.priorityList.length; i++) {
            const trait = state.minorTraitManager.priorityList[i];
            let classAttribute = ' class="script-draggable"';
            newTableBodyText += '<tr value="' + trait.traitName + '"' + classAttribute + '><td id="script_minorTrait_' + trait.traitName + 'Toggle" style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:40%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other minorTraits settings rows
        for (let i = 0; i < state.minorTraitManager.priorityList.length; i++) {
            const trait = state.minorTraitManager.priorityList[i];
            let minorTraitElement = $('#script_minorTrait_' + trait.traitName + 'Toggle');

            let toggle = $(`<span title="${game.traits[trait.traitName].desc}" class="has-text-info" style="margin-left: 20px;">${game.traits[trait.traitName].name}</span>`);
            minorTraitElement.append(toggle);

            minorTraitElement = minorTraitElement.next();
            minorTraitElement.append(buildStandartSettingsToggle(trait, "autoMinorTraitEnabled", "script_mTrait_" + trait.traitName));

            minorTraitElement = minorTraitElement.next();
            minorTraitElement.append(buildStandartSettingsInput(trait, "mTrait_w_" + trait.traitName, "autoMinorTraitWeighting"));

            minorTraitElement = minorTraitElement.next();
            minorTraitElement.append($('<span class="script-lastcolumn"></span>'));
        }

        $('#script_minorTraitTableBody').sortable( {
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                var $clone =  $(ui).clone();
                $clone .css('position','absolute');
                return $clone.get(0);
            },
            update: function() {
                let minorTraitNames = $('#script_minorTraitTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < minorTraitNames.length; i++) {
                    // MinorTrait has been dragged... Update all minorTrait priorities
                    state.minorTraitManager.priorityList.find(trait => trait.traitName === minorTraitNames[i]).priority = i;
                }

                state.minorTraitManager.sortByPriority();
                updateSettingsFromState();
            },
        } );
    }

    function buildProductionSettings() {
        let sectionId = "production";
        let sectionName = "Production";

        let resetFunction = function() {
            resetProductionState();
            resetProductionSettings();
            updateSettingsFromState();
            updateProductionSettingsContent();

            // Redraw toggles in resources tab
            if ( $('.ea-craft-toggle').length !== 0 ) {
              removeCraftToggles();
              createCraftToggles();
            }
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateProductionSettingsContent);
    }

    function updateProductionSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_productionContent');
        currentNode.empty().off("*");

        updateProductionTableSmelter(currentNode);
        updateProductionTableFactory(currentNode);
        updateProductionTableFoundry(currentNode);

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function updateProductionTableSmelter(currentNode) {
        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_productionPreTableSmelter"></div>');
        addStandardHeading(preTableNode, "Smelter");

        // Add table
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:25%">Fuel</th><th class="has-text-warning" style="width:75%"></th></tr>
                <tbody id="script_productionTableBodySmelter" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_productionTableBodySmelter');
        let newTableBodyText = "";

        let smelterFuels = state.cityBuildings.Smelter._fuelPriorityList;

        for (let i = 0; i < smelterFuels.length; i++) {
            const fuel = smelterFuels[i];
            let classAttribute = ' ';
            newTableBodyText += '<tr value="' + fuel.resource.id + '"' + classAttribute + '><td id="script_smelter_' + fuel.resource.id + '" style="width:25%"></td><td style="width:75%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < smelterFuels.length; i++) {
            const fuel = smelterFuels[i];
            let productionElement = $('#script_smelter_' + fuel.resource.id);

            productionElement.append(buildStandartLabel(fuel.resource.name));

            productionElement = productionElement.next();
            productionElement.append($('<span class="script-lastcolumn"></span>'));
        }

        $('#script_productionTableBodySmelter').sortable( {
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                var $clone =  $(ui).clone();
                $clone .css('position','absolute');
                return $clone.get(0);
            },
            update: function() {
                let fuelIds = $('#script_productionTableBodySmelter').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < fuelIds.length; i++) {
                    // Fuel has been dragged... Update all fuel priorities
                    state.cityBuildings.Smelter._fuelPriorityList.find(fuel => fuel.id === fuelIds[i]).priority = i;
                }

                state.cityBuildings.Smelter.sortByPriority();
                updateSettingsFromState();
            },
        } );
    }

    function updateProductionTableFactory(currentNode) {
        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_productionPreTableFactory"></div>');
        addStandardHeading(preTableNode, "Factory");
        addStandardSectionSettingsToggle(preTableNode, "productionMoneyIfOnly", "Override and produce money if we can't fill factories with other production", "If all other production has been allocated and there are leftover factories then use them to produce money");

        // Add table
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:35%">Resource</th><th class="has-text-warning" style="width:20%">Enabled</th><th class="has-text-warning" style="width:20%">Weighting</th><th class="has-text-warning" style="width:25%"></th></tr>
                <tbody id="script_productionTableBodyFactory" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_productionTableBodyFactory');
        let newTableBodyText = "";

        let productionSettings = state.cityBuildings.Factory.productionOptions;
        productionSettings.sort(function (a, b) { return a.seq - b.seq } );

        for (let i = 0; i < productionSettings.length; i++) {
            const production = productionSettings[i];
            let classAttribute = ' ';
            newTableBodyText += '<tr value="' + production.resource.id + '"' + classAttribute + '><td id="script_factory_' + production.resource.id + 'Toggle" style="width:35%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:35%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < productionSettings.length; i++) {
            const production = productionSettings[i];
            let productionElement = $('#script_factory_' + production.resource.id + 'Toggle');

            productionElement.append(buildStandartLabel(production.resource.name));

            productionElement = productionElement.next();
            productionElement.append(buildStandartSettingsToggle(production, "enabled", "script_factory_" + production.resource.id));

            productionElement = productionElement.next();
            productionElement.append(buildStandartSettingsInput(production, "production_w_" + production.resource.id, "weighting"));
        }
    }

    function updateProductionTableFoundry(currentNode) {
        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_productionPreTableFoundry"></div>');
        addStandardHeading(preTableNode, "Foundry");
        addStandardSectionSettingsToggle(preTableNode, "productionPrioritizeDemanded", "Prioritize demanded craftables", "Resources above amount required for constructions won't be crafted, if there's better options enabled and available, ignoring weighted ratio");
        addStandardSectionSettingsNumber(preTableNode, "productionMinRatio", "Preserve ingredients up to ratio", "Craft resources only when storages of all ingridients above given ratio");

        // Add table
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:35%">Resource</th><th class="has-text-warning" style="width:20%">Enabled</th><th class="has-text-warning" style="width:20%">Weighting</th><th class="has-text-warning" style="width:25%"></th></tr>
                <tbody id="script_productionTableBodyFoundry" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_productionTableBodyFoundry');
        let newTableBodyText = "";

        for (let i = 0; i < state.craftableResourceList.length; i++) {
            const resource = state.craftableResourceList[i];
            newTableBodyText += '<tr value="' + resource.id + '"><td id="script_foundry_' + resource.id + 'Toggle" style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:40%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < state.craftableResourceList.length; i++) {
            const resource = state.craftableResourceList[i];
            let productionElement = $('#script_foundry_' + resource.id + 'Toggle');

            productionElement.append(buildStandartLabel(resource.name));

            productionElement = productionElement.next();
            productionElement.append(buildStandartSettingsToggle(resource, "autoCraftEnabled", "script_craft2_" + resource.id, "script_craft1_" + resource.id));

            productionElement = productionElement.next();
            productionElement.append(buildStandartSettingsInput(resource, "foundry_w_" + resource.id, "weighting"));
        }
    }

    function buildJobSettings() {
        let sectionId = "job";
        let sectionName = "Job";

        let resetFunction = function() {
            resetJobSettings();
            resetJobState();
            updateSettingsFromState();
            updateJobSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateJobSettingsContent);
    }

    function updateJobSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_jobContent');
        currentNode.empty().off("*");

        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_jobPreTable"></div>');
        addStandardSectionSettingsToggle(preTableNode, "jobSetDefault", "Set default job", "Automatically sets the default job in order of Quarry Worker -> Lumberjack -> Scavenger -> Farmer");
        addStandardSectionSettingsNumber(preTableNode, "jobLumberWeighting", "Final Lumberjack Weighting", "AFTER allocating breakpoints this weighting will be used to split lumberjacks, quarry workers, crystal miners and scavengers");
        addStandardSectionSettingsNumber(preTableNode, "jobQuarryWeighting", "Final Quarry Worker Weighting", "AFTER allocating breakpoints this weighting will be used to split lumberjacks, quarry workers, crystal miners and scavengers");
        addStandardSectionSettingsNumber(preTableNode, "jobCrystalWeighting", "Final Crystal Miner Weighting", "AFTER allocating breakpoints this weighting will be used to split lumberjacks, quarry workers, crystal miners and scavengers");
        addStandardSectionSettingsNumber(preTableNode, "jobScavengerWeighting", "Final Scavenger Weighting", "AFTER allocating breakpoints this weighting will be used to split lumberjacks, quarry workers, crystal miners and scavengers");

        // Add table
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:35%">Job</th><th class="has-text-warning" style="width:20%">1st Pass Max</th><th class="has-text-warning" style="width:20%">2nd Pass Max</th><th class="has-text-warning" style="width:20%">Final Max</th><th style="width:5%"></th></tr>
                <tbody id="script_jobTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_jobTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < state.jobManager.priorityList.length; i++) {
            const job = state.jobManager.priorityList[i];
            let classAttribute = job !== state.jobs.Farmer ? ' class="script-draggable"' : ' class="unsortable"';
            newTableBodyText += '<tr value="' + job._originalId + '"' + classAttribute + '><td id="script_' + job._originalId + 'Toggle" style="width:35%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        for (let i = 0; i < state.jobManager.priorityList.length; i++) {
            const job = state.jobManager.priorityList[i];
            let jobElement = $('#script_' + job._originalId + 'Toggle');

            var toggle = buildJobSettingsToggle(job);
            jobElement.append(toggle);

            jobElement = jobElement.next();
            jobElement.append(buildJobSettingsInput(job, 1));
            jobElement = jobElement.next();
            jobElement.append(buildJobSettingsInput(job, 2));
            jobElement = jobElement.next();
            jobElement.append(buildJobSettingsInput(job, 3));
        }

        $('#script_jobTableBody').sortable( {
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                var $clone =  $(ui).clone();
                $clone .css('position','absolute');
                return $clone.get(0);
            },
            update: function() {
                let jobIds = $('#script_jobTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < jobIds.length; i++) {
                    // Job has been dragged... Update all job priorities
                    state.jobManager.priorityList.find(job => job._originalId === jobIds[i]).priority = i + 1; // farmers is always 0
                }

                state.jobManager.sortByPriority();
                updateSettingsFromState();
            },
        } );

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    /**
     * @param {Job} job
     */
    function buildJobSettingsToggle(job) {
        let checked = job.autoJobEnabled ? " checked" : "";
        let classAttribute = !job.isCraftsman() ? ' class="has-text-info"' : ' class="has-text-danger"';
        let marginTop = job !== state.jobs.Farmer ? ' margin-top: 4px;' : "";
        let toggle = $('<label tabindex="0" class="switch"' + marginTop + ' margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span' + classAttribute + ' style="margin-left: 20px;">' + job._originalName + '</span></label>');

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            job.autoJobEnabled = input.checked;
            updateSettingsFromState();
            //console.log(job._originalName + " changed state to " + state);
        });

        return toggle;
    }

    /**
     * @param {Job} job
     * @param {number} breakpoint
     */
    function buildJobSettingsInput(job, breakpoint) {
        if (job === state.jobs.Farmer || job.isCraftsman() || (breakpoint === 3 && (job === state.jobs.Lumberjack || job === state.jobs.QuarryWorker || job === state.jobs.CrystalMiner || job === state.jobs.Scavenger))) {
            let span = $('<span>Managed</span>');
            return span;
        }

        let jobBreakpointTextbox = $('<input type="text" class="input is-small" style="width:100%"/>');
        jobBreakpointTextbox.val(settings["job_b" + breakpoint + "_" + job._originalId]);

        jobBreakpointTextbox.on('change', function() {
            let val = jobBreakpointTextbox.val();
            let employees = getRealNumber(val);
            if (!isNaN(employees)) {
                //console.log('Setting job breakpoint ' + breakpoint + ' for job ' + job._originalName + ' to be ' + employees);
                job.setBreakpoint(breakpoint, employees);
                updateSettingsFromState();
            }
        });

        return jobBreakpointTextbox;
    }

    function buildWeightingSettings() {
        let sectionId = "weighting";
        let sectionName = "AutoBuild Weighting";

        let resetFunction = function() {
            resetWeightingSettings();
            updateSettingsFromState();
            updateWeightingSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateWeightingSettingsContent);
    }

    function updateWeightingSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_weightingContent');
        currentNode.empty().off("*");

        // Add table
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:30%">Target</th><th class="has-text-warning" style="width:60%">Condition</th><th class="has-text-warning" style="width:10%">Multiplier</th></tr>
                <tbody id="script_weightingTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_weightingTableBody');

        // TODO: Make rules fully customizable? Like, eval() user's conditions, or configure them in some fancy gui.
        addWeighingRule(tableBodyNode, "Any", "New building", "buildingWeightingNew");
        addWeighingRule(tableBodyNode, "Powered building", "Low available energy", "buildingWeightingUnderpowered");
        addWeighingRule(tableBodyNode, "Power plant", "Low available energy", "buildingWeightingNeedfulPowerPlant");
        addWeighingRule(tableBodyNode, "Power plant", "Producing more energy than required", "buildingWeightingUselessPowerPlant");
        addWeighingRule(tableBodyNode, "Knowledge storage", "Have unlocked unafforable researches", "buildingWeightingNeedfulKnowledge");
        addWeighingRule(tableBodyNode, "Knowledge storage", "All unlocked researches already affordable", "buildingWeightingUselessKnowledge");
        addWeighingRule(tableBodyNode, "Mass Ejector", "Existed ejectors not fully utilized", "buildingWeightingUnusedEjectors");
        addWeighingRule(tableBodyNode, "Not housing or barrack", "MAD prestige enabled, and affordable", "buildingWeightingMADUseless");
        addWeighingRule(tableBodyNode, "Freight Yard, Container Port", "Have unused crates or containers", "buildingWeightingCrateUseless");
        addWeighingRule(tableBodyNode, "All fuel depots", "Missing Oil or Helium for mission", "buildingWeightingMissingFuel");
        addWeighingRule(tableBodyNode, "Building with state (city)", "Some instances of this building are not working", "buildingWeightingNonOperatingCity");
        addWeighingRule(tableBodyNode, "Building with state (space)", "Some instances of this building are not working", "buildingWeightingNonOperating");
        addWeighingRule(tableBodyNode, "Any", "Conflicts for some resource with active trigger", "buildingWeightingTriggerConflict");
        addWeighingRule(tableBodyNode, "Any", "Missing consumables or support to operate", "buildingWeightingMissingSupply");

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function addWeighingRule(table, targetName, conditionDesc, settingName){
        let ruleNode = $(`<tr>
                          <td style="width:30%"><span class="has-text-info">${targetName}</span></td>
                          <td style="width:60%"><span class="has-text-info">${conditionDesc}</span></td>
                          <td style="width:10%"><input type="text" class="input is-small" style="width:100%"/></td>
                        </tr>`);

        let weightInput = ruleNode.find('input');
        weightInput.val(settings[settingName]);
        weightInput.on('change', function() {
            let parsedValue = getRealNumber(this.value);
            if (!isNaN(parsedValue)) {
                settings[settingName] = parsedValue;
                updateSettingsFromState();
            }
        });

        table.append(ruleNode)
    }

    function buildBuildingSettings() {
        let sectionId = "building";
        let sectionName = "Building";

        let resetFunction = function() {
            resetBuildingSettings();
            resetBuildingState();
            updateSettingsFromState();
            updateBuildingSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateBuildingSettingsContent);
    }

    function updateBuildingSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_buildingContent');
        currentNode.empty().off("*");

        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_buildingPreTable"></div>');
        addStandardSectionSettingsToggle(preTableNode, "buildingBuildIfStorageFull", "Ignore weighting and build if storage is full", "Ignore weighting and immediately construct building if it uses any capped resource, preventing wasting them by overflowing. Weight still need to be positive(above zero) for this to happen.");

        // Add table
        currentNode.append(
            `<div><input id="script_buildingSearch" class="script-searchsettings" type="text" placeholder="Search for buildings.."></div>
            <table style="width:100%"><tr><th class="has-text-warning" style="width:40%">Building</th><th class="has-text-warning" style="width:15%">Auto Build</th><th class="has-text-warning" style="width:15%">Max Build</th><th class="has-text-warning" style="width:15%">Weight</th><th class="has-text-warning" style="width:15%">Manage State</th></tr>
                <tbody id="script_buildingTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_buildingTableBody');
        let newTableBodyText = "";

        $("#script_buildingSearch").on("keyup", filterBuildingSettingsTable); // Add building filter

        // Add in a first row for switching "All"
        newTableBodyText += '<tr value="All" class="unsortable"><td id="script_bldallToggle" style="width:40%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td></tr>';

        for (let i = 0; i < state.buildingManager.priorityList.length; i++) {
            const building = state.buildingManager.priorityList[i];
            let classAttribute = ' class="script-draggable"';
            newTableBodyText += '<tr value="' + building.settingId + '"' + classAttribute + '><td id="script_' + building.settingId + 'Toggle" style="width:40%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build special "All Buildings" top row
        let buildingElement = $('#script_bldallToggle');
        let toggle = $('<span class="has-text-warning" style="margin-left: 20px;">All Buildings</span>');
        buildingElement.append(toggle);

        // enabled column
        buildingElement = buildingElement.next();
        toggle = buildAllBuildingEnabledSettingsToggle(state.buildingManager.priorityList);
        buildingElement.append(toggle);

        // max column
        buildingElement = buildingElement.next();
        buildingElement.append($('<span></span>'));

        // weight column
        buildingElement = buildingElement.next();
        buildingElement.append($('<span></span>'));

        // state column
        buildingElement = buildingElement.next();
        toggle = buildAllBuildingStateSettingsToggle(state.buildingManager.priorityList);
        buildingElement.append(toggle);

        // Build all other buildings settings rows
        for (let i = 0; i < state.buildingManager.priorityList.length; i++) {
            const building = state.buildingManager.priorityList[i];
            let buildingElement = $('#script_' + building.settingId + 'Toggle');

            buildingElement.append(buildStandartLabel(building.name, building._tab !== "city"));

            buildingElement = buildingElement.next();
            buildingElement.append(buildStandartSettingsToggle(building, "autoBuildEnabled", "script_bat2_" + building.settingId, "script_bat1_" + building.settingId));

            buildingElement = buildingElement.next();
            buildingElement.append(buildStandartSettingsInput(building, "bld_m_" + building.settingId, "autoMax"));

            buildingElement = buildingElement.next();
            buildingElement.append(buildStandartSettingsInput(building, "bld_w_" + building.settingId, "_weighting"));

            buildingElement = buildingElement.next();
            buildingElement.append(buildBuildingStateSettingsToggle(building));
        }

        $('#script_buildingTableBody').sortable( {
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                var $clone =  $(ui).clone();
                $clone .css('position','absolute');
                return $clone.get(0);
            },
            update: function() {
                let buildingElements = $('#script_buildingTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < buildingElements.length; i++) {
                    // Building has been dragged... Update all building priorities
                    if (buildingElements[i] !== "All") {
                        state.buildingManager.priorityList.find(building => building.settingId === buildingElements[i]).priority = i - 1;
                    }
                }

                state.buildingManager.sortByPriority();
                updateSettingsFromState();
            },
        } );

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function filterBuildingSettingsTable() {
        // Declare variables
        let input = document.getElementById("script_buildingSearch");
        //@ts-ignore
        let filter = input.value.toUpperCase();
        let table = document.getElementById("script_buildingTableBody");
        let trs = table.getElementsByTagName("tr");

        // Loop through all table rows, and hide those who don't match the search query
        for (let i = 0; i < trs.length; i++) {
            let td = trs[i].getElementsByTagName("td")[0];
            if (td) {
                if (td.textContent.toUpperCase().indexOf(filter) > -1) {
                    trs[i].style.display = "";
                } else {
                    trs[i].style.display = "none";
                }
            }
        }

        let content = document.querySelector('#script_buildingSettings .script-content');
        content.style.height = null;
        content.style.height = content.offsetHeight + "px"
    }

    /**
     * @param {Action[]} buildings
     */
    function buildAllBuildingEnabledSettingsToggle(buildings) {
        let checked = settings.buildingEnabledAll ? " checked" : "";
        let toggle = $('<label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span></label>');

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = input.checked;

            settings.buildingEnabledAll = state;

            for (let i = 0; i < buildings.length; i++) {
                buildings[i].autoBuildEnabled = state;
            }

            let toggles = document.querySelectorAll('[id^="script_bat"] input');

            for (let i = 0; i < toggles.length; i++) {
                // @ts-ignore
                toggles[i].checked = state;
            }

            updateSettingsFromState();
            //console.log(building.name + " changed enabled to " + state);
        });

        return toggle;
    }

    /**
     * @param {Action} building
     */
    function buildBuildingStateSettingsToggle(building) {
        let toggle = null;
        let checked = building.autoStateEnabled ? " checked" : "";

        if (building.hasConsumption()) {
            toggle = $('<label id=script_bld_s_' + building.settingId + ' tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span></label><span class="script-lastcolumn"></span>');
        } else {
            toggle = $('<span class="script-lastcolumn"></span>');
        }

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            building.autoStateEnabled = input.checked;
            updateSettingsFromState();
            //console.log(building.name + " changed state to " + state);
        });

        return toggle;
    }

    /**
     * @param {Action[]} buildings
     */
    function buildAllBuildingStateSettingsToggle(buildings) {
        let checked = settings.buildingStateAll ? " checked" : "";
        let toggle = $('<label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span></label>');

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = input.checked;

            settings.buildingStateAll = state;

            for (let i = 0; i < buildings.length; i++) {
                buildings[i].autoStateEnabled = state;
            }

            let toggles = document.querySelectorAll('[id^="script_bld_s_"] input');

            for (let i = 0; i < toggles.length; i++) {
                // @ts-ignore
                toggles[i].checked = state;
            }

            updateSettingsFromState();
            //console.log(building.name + " changed state to " + state);
        });

        return toggle;
    }

    function buildProjectSettings() {
        let sectionId = "project";
        let sectionName = "A.R.P.A.";

        let resetFunction = function() {
            resetProjectSettings();
            resetProjectState();
            updateSettingsFromState();
            updateProjectSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateProjectSettingsContent);
    }

    function updateProjectSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_projectContent');
        currentNode.empty().off("*");

        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_projectPreTable"></div>');
        addStandardSectionSettingsToggle(preTableNode, "arpaBuildIfStorageFull", "Override and build if storage is full", "Overrides the below settings to still build A.R.P.A projects if resources are full");
        addStandardSectionSettingsNumber(preTableNode, "arpaBuildIfStorageFullCraftableMin", "Minimum craftables to keep if overriding", "A.R.P.A. projects that require crafted resources won't override and build if resources are below this amount, -1 stands for maximum amount required by other buildings.");
        addStandardSectionSettingsNumber(preTableNode, "arpaBuildIfStorageFullResourceMaxPercent", "Maximim percent of resources if overriding", "A.R.P.A. project that require more than this percentage of a non-crafted resource won't override and build");

        // Add table section
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:25%">Project</th><th class="has-text-warning" style="width:25%">Enabled</th><th class="has-text-warning" style="width:25%">Max Build</th><th class="has-text-warning" style="width:25%">Ignore Min Money</th></tr>
                <tbody id="script_projectTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_projectTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < state.projectManager.priorityList.length; i++) {
            const project = state.projectManager.priorityList[i];
            let classAttribute = ' class="script-draggable"';
            newTableBodyText += '<tr value="' + project.id + '"' + classAttribute + '><td id="script_' + project.id + 'Toggle" style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other projects settings rows
        for (let i = 0; i < state.projectManager.priorityList.length; i++) {
            const project = state.projectManager.priorityList[i];
            let projectElement = $('#script_' + project.id + 'Toggle');

            projectElement.append(buildStandartLabel(project.name));

            projectElement = projectElement.next();
            projectElement.append(buildStandartSettingsToggle(project, "autoBuildEnabled", "script_arpa2_" + project.id, "script_arpa1_" + project.id));

            projectElement = projectElement.next();
            projectElement.append(buildStandartSettingsInput(project, "arpa_m_" + project.id, "autoMax"));

            projectElement = projectElement.next();
            projectElement.append(buildStandartSettingsToggle(project, "ignoreMinimumMoneySetting", "script_arpa_ignore_money_" + project.id));
        }

        $('#script_projectTableBody').sortable( {
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                var $clone =  $(ui).clone();
                $clone .css('position','absolute');
                return $clone.get(0);
            },
            update: function() {
                let projectIds = $('#script_projectTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < projectIds.length; i++) {
                    // Project has been dragged... Update all project priorities
                    state.projectManager.priorityList.find(project => project.id === projectIds[i]).priority = i;
                }

                state.projectManager.sortByPriority();
                updateSettingsFromState();
            },
        } );

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildLoggingSettings(parentNode, isMainSettings) {
        let sectionId = "logging";
        let sectionName = "Logging";

        let resetFunction = function() {
            resetLoggingSettings();
            updateSettingsFromState();
            updateLoggingSettingsContent(isMainSettings);
        };

        buildSettingsSection2(parentNode, isMainSettings, sectionId, sectionName, resetFunction, updateLoggingSettingsContent);
    }

    function updateLoggingSettingsContent(isMainSettings) {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;
        let secondaryPrefix = "c_";

        if (isMainSettings) {
            secondaryPrefix = "";
        }

        let currentNode = $(`#script_${secondaryPrefix}loggingContent`);
        currentNode.empty().off("*");

        // Add any pre table settings
        let preTableNode = currentNode.append(`<div id="script_${secondaryPrefix}loggingPreTable"></div>`);
        addStandardSectionSettingsToggle2(secondaryPrefix, preTableNode, 0, "logEnabled", "Enable logging", "Master switch to enable logging of script actions in the game message queue");

        Object.keys(loggingTypes).forEach(loggingTypeKey => {
            let loggingType = loggingTypes[loggingTypeKey];
            addStandardSectionSettingsToggle2(secondaryPrefix, preTableNode, 1, loggingType.settingKey, loggingType.name, `If logging is enabled then logs ${loggingType.name} actions`);
        });

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function createQuickOptions(node, optionsElementId, optionsDisplayName, buildOptionsFunction) {
        let optionsDiv = $(`<div style="cursor: pointer;" id="${optionsElementId}">${optionsDisplayName} Options</div>`);
        node.append(optionsDiv);

        addOptionUI(optionsElementId + "_btn", `#${optionsElementId}`, optionsDisplayName, buildOptionsFunction);
        addOptionUiClickHandler(optionsDiv, optionsDisplayName, buildOptionsFunction);
    }

    function createSettingToggle(node, name, title, enabledCallBack, disabledCallBack) {
        let checked = settings[name] ? " checked" : "";
        let toggle = $(`<label tabindex="0" class="switch" id="${name}" style="" title="${title}"><input type="checkbox" value="${settings[name]}"${checked}/> <span class="check"></span><span>${name}</span></label></br>`);
        node.append(toggle);

        if (settings[name]) {
            if (enabledCallBack !== undefined) {
                enabledCallBack();
            }
        }

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = !(input.getAttribute('value') === "true");

            input.setAttribute('value', state);
            settings[name] = state;
            updateSettingsFromState();
            if (state && enabledCallBack !== undefined) {
                enabledCallBack();
            } else if (disabledCallBack !== undefined) {
                disabledCallBack()
            }
        });
    }

    function updateOptionsUI() {
        // City district outskirts
        // if (document.getElementById("s-city-dist-outskirts-options") === null) {
        //     let sectionNode = $('#city-dist-outskirts h3');

        // Build secondary options buttons if they don't currently exist
        addOptionUI("s-government-options", "#government div h2", "Government", buildGovernmentSettings);
        addOptionUI("s-foreign-options", "#foreign div h2", "Foreign Affairs", buildWarSettings);
        addOptionUI("s-hell-options", "#gFort div h3", "Hell", buildHellSettings);
        addOptionUI("s-hell-options2", "#prtl_fortress div h3", "Hell", buildHellSettings);
    }

    /**
     * @param {string} optionsId
     * @param {string} querySelectorText
     * @param {string} modalTitle
     * @param {{ (parentNode: any, isMainSettings: boolean): void; (parentNode: any, isMainSettings: boolean): void; (arg0: any): void; }} buildOptionsFunction
     */
    function addOptionUI(optionsId, querySelectorText, modalTitle, buildOptionsFunction) {
        if (document.getElementById(optionsId) !== null) { return; } // We've already built the options UI

        let sectionNode = $(querySelectorText);

        if (sectionNode.length === 0) { return; } // The node that we want to add it to doesn't exist yet

        let newOptionNode = $(`<span id="${optionsId}" class="s-options-button has-text-success">+</span>`);
        sectionNode.prepend(newOptionNode);
        addOptionUiClickHandler(newOptionNode, modalTitle, buildOptionsFunction);
    }

    /**
     * @param {{ on: (arg0: string, arg1: () => void) => void; }} optionNode
     * @param {string} modalTitle
     * @param {{ (parentNode: any, isMainSettings: boolean): void; (parentNode: any, isMainSettings: boolean): void; (arg0: any): void; (arg0: any): void; }} buildOptionsFunction
     */
    function addOptionUiClickHandler(optionNode, modalTitle, buildOptionsFunction) {
        optionNode.on('click', function() {
            // Build content
            let modalHeader = $('#scriptModalHeader');
            modalHeader.empty().off("*");
            modalHeader.append(`<span>${modalTitle}</span>`);

            let modalBody = $('#scriptModalBody');
            modalBody.empty().off("*");
            buildOptionsFunction(modalBody);

            // Show modal
            let modal = document.getElementById("scriptModal");
            $("html").css('overflow', 'hidden');
            modal.style.display = "block";
        });
    }

    function createOptionsModal() {
        if (document.getElementById("scriptModal") !== null) {
            return;
        }

        let modal = $(`
<div id="scriptModal" class="script-modal">
    <span id="scriptModalClose" class="script-modal-close">&times;</span>
    <div class="script-modal-content">
        <div id="scriptModalHeader" class="script-modal-header has-text-warning">You should never see this modal header...</div>
        <div id="scriptModalBody" class="script-modal-body">
            <p>You should never see this modal body...</p>
        </div>
    </div>
</div>
`);

        // Append the script modal to the document
        $(document.body).append(modal);

        // Add the script modal close button action
        $('#scriptModalClose').on("click", function() {
            let modal = document.getElementById("scriptModal");
            modal.style.display = "none";
            $("html").css('overflow-y', 'scroll');
        });

        // If the user clicks outside the modal then close it
        $(window).on("click", function(event) {
            let modal = document.getElementById("scriptModal");
            if (event.target == modal) {
                modal.style.display = "none";
                $("html").css('overflow-y', 'scroll');
            }
        });
    }

    function updateUI() {
        let resetScrollPositionRequired = false;
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        createOptionsModal();
        updateOptionsUI();

        let scriptNode = $('#autoScriptContainer');
        if (scriptNode.length === 0) {
            scriptNode = $('<div id="autoScriptContainer"></div>');
            $('#resources').append(scriptNode);
            resetScrollPositionRequired = true;

            scriptNode.append('<label id="autoScriptInfo">More script options available in Settings tab</label></br>');

            createSettingToggle(scriptNode, 'masterScriptToggle', 'Stop taking any actions on behalf of the player.');

            // Dirty performance patch. Settings have a lot of elements, and they stress JQuery selectors way too much. This toggle allow to remove them from DOM completely, when they aren't needed.
            // It doesn't have such huge impact anymore, as used to before rewriting trigger's tech selectors, but still won't hurt to have an option to increase performance a bit more
            createSettingToggle(scriptNode, 'showSettings', 'You can disable rendering of settings UI once you\'ve done with configuring script, if you experiencing performance issues. It can help a little.', buildScriptSettings, removeScriptSettings);

            createSettingToggle(scriptNode, 'autoEvolution', 'Runs through the evolution part of the game through to founding a settlement. In Auto MAD Achievements mode will target races that you don\'t have extinction achievements for yet.');
            createSettingToggle(scriptNode, 'autoFight', 'Sends troops to battle whenever Soldiers are full and there are no wounded. Adds to your offensive battalion and switches attack type when offensive rating is greater than the rating cutoff for that attack type.');
            createSettingToggle(scriptNode, 'autoHell', 'Sends soldiers to hell and sends them out on patrols. Adjusts maximum number of powered attractors based on threat.');
            createSettingToggle(scriptNode, 'autoTax', 'Adjusts tax rates if your current morale is greater than your maximum allowed morale. Will always keep morale above 100%.');
            createSettingToggle(scriptNode, 'autoCraft', 'Craft when a specified crafting ratio is met. This changes throughout the game - lower in the beginning and rising as the game progresses.', createCraftToggles, removeCraftToggles);
            createSettingToggle(scriptNode, 'autoBuild', 'Builds city and space building when it can an production allows (eg. Won\'t build a Fission Reactor if you don\'t have enough uranium production). Currently has a few smarts for higher plasmid counts to get certain building built a little bit quicker.', createBuildingToggles, removeBuildingToggles);
            createSettingToggle(scriptNode, 'autoPower', 'Manages power based on a priority order of buildings. Starts with city based building then space based.');
            createSettingToggle(scriptNode, 'autoStorage', 'Assigns crates to allow storage of resources.');
            createSettingToggle(scriptNode, 'autoMarket', 'Allows for automatic buying and selling of resources once specific ratios are met. Also allows setting up trade routes until a minimum specified money per second is reached. The will trade in and out in an attempt to maximise your trade routes.', createMarketToggles, removeMarketToggles);
            createSettingToggle(scriptNode, 'autoResearch', 'Performs research when minimum requirements are met. ');
            createSettingToggle(scriptNode, 'autoARPA', 'Builds ARPA projects if user enables them to be built.', createArpaToggles, removeArpaToggles);
            createSettingToggle(scriptNode, 'autoJobs', 'Assigns jobs in a priority order with multiple breakpoints. Starts with a few jobs each and works up from there. Will try to put a minimum number on lumber / stone then fill up capped jobs first.');
            createSettingToggle(scriptNode, 'autoCraftsmen', 'Enable this when performing challenge runs and autoJobs will also manage craftsmen.');
            createSettingToggle(scriptNode, 'autoSmelter', 'Manages smelter output at different stages at the game.');
            createSettingToggle(scriptNode, 'autoFactory', 'Manages factory production based on power and consumption. Produces alloys as a priority until nano-tubes then produces those as a priority.');
            createSettingToggle(scriptNode, 'autoMiningDroid', 'Manages mining droid production based on power and consumption. Produces Adamantite only. Not currently user configurable.');
            createSettingToggle(scriptNode, 'autoGraphenePlant', 'Uses what fuel it can to fuel the graphene plant. Not currently user configurable.');
            createSettingToggle(scriptNode, 'autoAssembleGene', 'Automatically assembles genes only when your knowledge is at max. Stops when DNA Sequencing is researched.');
            createSettingToggle(scriptNode, 'autoMinorTrait', 'Purchase minor traits using genes according to their weighting settings.');

            createQuickOptions(scriptNode, "s-quick-prestige-options", "Prestige", buildPrestigeSettings);

            if (showLogging) {
                createSettingToggle(scriptNode, 'autoLogging', 'autoLogging');

                let settingsDiv = $('<div id="ea-logging"></div>');
                let logTypeTxt = $('<div>Logging Type:</div>')
                let logTypeInput = $('<input type="text" class="input is-small" style="width:100%"/>');
                logTypeInput.val(loggingType);
                let setBtn = $('<a class="button is-dark is-small" id="set-loggingType"><span>set</span></a>');
                settingsDiv.append(logTypeTxt).append(logTypeInput).append(setBtn);
                scriptNode.append(settingsDiv);

                setBtn.on('mouseup', function() {
                   let val = logTypeInput.val();
                   loggingType = val;
                });
            }

            let bulkSell = $('<a class="button is-dark is-small" id="bulk-sell"><span>Bulk Sell</span></a>');
            scriptNode.append(bulkSell);
            bulkSell.on('mouseup', function(e) {
                autoMarket(true, true);
            });

            let settingsDiv = $('<div id="ea-settings"></div>');
            let minMoneyTxt = $('<div>Minimum money to keep :</div>')
            let minMoneyInput = $('<input type="text" class="input is-small" style="width:100%"/>');
            let minimumMoneyValue = settings.minimumMoney > 0 ? settings.minimumMoney : settings.minimumMoneyPercentage;
            minMoneyInput.val(minimumMoneyValue);
            let setBtn = $('<a class="button is-dark is-small" id="set-min-money"><span>Set</span></a>');
            let setPercentBtn = $('<a class="button is-dark is-small" id="set-min-money" title="eg. 10 equals 10%"><span>Set %</span></a>');
            settingsDiv.append(minMoneyTxt).append(minMoneyInput).append(setBtn).append(setPercentBtn);
            scriptNode.append(settingsDiv);

            setBtn.on('click', function() {
                let val = minMoneyInput.val();
                let minMoney = getRealNumber(val);
                if (!isNaN(minMoney)) {
                    console.log('Setting minimum money to : ' + minMoney);
                    settings.minimumMoney = minMoney;
                    settings.minimumMoneyPercentage = 0;
                    updateSettingsFromState();
                }
            });

            setPercentBtn.on('click', function() {
                let val = minMoneyInput.val();
                let minMoneyPercent = getRealNumber(val);
                if (!isNaN(minMoneyPercent)) {
                    console.log('Setting minimum money percentage to : ' + minMoneyPercent);
                    settings.minimumMoneyPercentage = minMoneyPercent;
                    settings.minimumMoney = 0;
                    updateSettingsFromState();
                }
            });
        }

        if (scriptNode.next().length) {
            resetScrollPositionRequired = true;
            scriptNode.parent().append(scriptNode);
        }

        if (settings.showSettings && $("#script_settings").length === 0) {
            buildScriptSettings();
        }
        if (settings.autoCraft && $('.ea-craft-toggle').length === 0) {
            createCraftToggles();
        }
        if (settings.autoBuild && $('.ea-building-toggle').length === 0) {
            createBuildingToggles();
        }
        if (settings.autoMarket > 0 && $('.ea-market-toggle').length === 0 && isMarketUnlocked()) {
            createMarketToggles();
        }
        if (settings.autoARPA && $('.ea-arpa-toggle').length === 0) {
            createArpaToggles();
        }

        if (resetScrollPositionRequired) {
            // Leave the scroll position where it was before all our updates to the UI above
            document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
        }
    }

    /**
     * @param {Project} project
     */
    function createArpaToggle(project) {
        let checked = project.autoBuildEnabled ? " checked" : "";
        let arpaDiv = $('#arpa' + project.id + ' .head');
        let toggle = $('<label id=script_arpa1_' + project.id + ' tabindex="0" class="switch ea-arpa-toggle" style="position:relative; max-width:75px;margin-top: -36px;left:45%;float:left;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px;"></span></label>');
        arpaDiv.append(toggle);
        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = input.checked;
            project.autoBuildEnabled = state;
            // @ts-ignore
            let otherCheckbox = document.querySelector('#script_arpa2_' + project.id + ' input');
            if (otherCheckbox !== null) {
                // @ts-ignore
                otherCheckbox.checked = state;
            }
            updateSettingsFromState();
        });
    }

    function createArpaToggles() {
        removeArpaToggles();
        createArpaToggle(state.projects.SuperCollider);
        createArpaToggle(state.projects.StockExchange);
        createArpaToggle(state.projects.Monument);
        createArpaToggle(state.projects.Railway);

        if (state.projects.LaunchFacility.isUnlocked()) {
            createArpaToggle(state.projects.LaunchFacility);
        }
    }

    function removeArpaToggles() {
        $('.ea-arpa-toggle').remove();
    }

    /**
     * @param {Resource} craftable
     */
    function createCraftToggle(craftable) {
        let resourceSpan = $('#res' + craftable.id);
        let checked = craftable.autoCraftEnabled ? " checked" : "";
        let toggle = $(`<label tabindex="0" id=script_craft1_${craftable.id} class="switch ea-craft-toggle" style="position:absolute; max-width:75px;margin-top: 4px;left:30%;"><input type="checkbox" value=${craftable.autoCraftEnabled}${checked}/> <span class="check" style="height:5px;"></span></label>`);
        resourceSpan.append(toggle);
        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = !(input.getAttribute('value') === "true");
            input.setAttribute('value', state);
            craftable.autoCraftEnabled = state;
            let otherCheckbox = document.querySelector(`#script_craft2_${craftable.id} input`);
            if (otherCheckbox !== null) {
                otherCheckbox.checked = state;
            }
            updateSettingsFromState();
        });
    }

    function createCraftToggles() {
        for (let i = 0; i < state.craftableResourceList.length; i++) {
            let craftable = state.craftableResourceList[i];
            createCraftToggle(craftable);
        }
    }

    function removeCraftToggles() {
        $('.ea-craft-toggle').remove();
    }

    /**
     * @param {Action} building
     */
    function createBuildingToggle(building) {
        let checked = building.autoBuildEnabled ? " checked" : "";
        let buildingElement = $('#' + building.settingId);
        let toggle = $('<label id=script_bat1_' + building.settingId + ' tabindex="0" class="switch ea-building-toggle" style="position:absolute; margin-top: 24px;left:10%;"><input type="checkbox"' + checked + '/> <span class="check" style="height:5px; max-width:15px"></span></label>');
        buildingElement.append(toggle);

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = input.checked;
            building.autoBuildEnabled = state;
            let otherCheckbox = document.querySelector('#script_bat2_' + building.settingId + ' input');
            if (otherCheckbox !== null) {
                // @ts-ignore
                otherCheckbox.checked = state;
            }
            updateSettingsFromState();
        });
    }

    function createBuildingToggles() {
        removeBuildingToggles();

        for (let i = 0; i < state.buildingManager.priorityList.length; i++) {
            createBuildingToggle(state.buildingManager.priorityList[i]);
        }
    }

    function removeBuildingToggles() {
        $('.ea-building-toggle').remove();
    }

    /**
     * @param {Resource} resource
     */
    function createMarketToggle(resource) {
        let autoBuyChecked = resource.autoBuyEnabled ? " checked" : "";
        let autoSellChecked = resource.autoSellEnabled ? " checked" : "";
        let autoTradeBuyChecked = resource.autoTradeBuyEnabled ? " checked" : "";
        let autoTradeSellChecked = resource.autoTradeSellEnabled ? " checked" : "";
        let marketRow = $('#market-' + resource.id);
        let toggleBuy = $('<label id="script_buy1_' +  resource.id + '" tabindex="0" title="Enable buying of this resource. When to buy is set in the Settings tab."  class="switch ea-market-toggle" style=""><input type="checkbox"' + autoBuyChecked + '> <span class="check" style="height:5px;"></span><span class="control-label" style="font-size: small;">buy</span><span class="state"></span></label>');
        let toggleSell = $('<label id="script_sell1_' +  resource.id + '" tabindex="0" title="Enable selling of this resource. When to sell is set in the Settings tab."  class="switch ea-market-toggle" style=""><input type="checkbox"' + autoSellChecked + '> <span class="check" style="height:5px;"></span><span class="control-label" style="font-size: small;">sell</span><span class="state"></span></label>');
        let toggleTradeFor = $('<label id="script_tbuy1_' +  resource.id + '" tabindex="0" title="Enable trading for this resource. Max routes is set in the Settings tab." class="switch ea-market-toggle" style=""><input type="checkbox"' + autoTradeBuyChecked + '> <span class="check" style="height:5px;"></span><span class="control-label" style="font-size: small;">trade for</span><span class="state"></span></label>');
        let toggleTradeAway = $('<label id="script_tsell1_' +  resource.id + '" tabindex="0" title="Enable trading this resource away. Min income is set in the Settings tab." class="switch ea-market-toggle" style=""><input type="checkbox"' + autoTradeSellChecked + '> <span class="check" style="height:5px;"></span><span class="control-label" style="font-size: small;">trade away</span><span class="state"></span></label>');
        marketRow.append(toggleBuy);
        marketRow.append(toggleSell);
        marketRow.append(toggleTradeFor);
        marketRow.append(toggleTradeAway);

        toggleBuy.on('change', function(e) {
            //console.log(e);
            let input = e.currentTarget.children[0];
            let state = input.checked;
            resource.autoBuyEnabled = state;
            let otherCheckbox = document.querySelector('#script_buy2_' + resource.id + ' input');
            if (otherCheckbox !== null) {
                // @ts-ignore
                otherCheckbox.checked = state;
            }
            updateSettingsFromState();
            //console.log(state);
        });

        toggleSell.on('change', function(e) {
            //console.log(e);
            let input = e.currentTarget.children[0];
            let state = input.checked;
            resource.autoSellEnabled = state;
            let otherCheckbox = document.querySelector('#script_sell2_' + resource.id + ' input');
            if (otherCheckbox !== null) {
                // @ts-ignore
                otherCheckbox.checked = state;
            }
            updateSettingsFromState();
            //console.log(state);
        });

        toggleTradeFor.on('change', function(e) {
            //console.log(e);
            let input = e.currentTarget.children[0];
            let state = input.checked;
            resource.autoTradeBuyEnabled = state;
            let otherCheckbox = document.querySelector('#script_tbuy2_' + resource.id + ' input');
            if (otherCheckbox !== null) {
                // @ts-ignore
                otherCheckbox.checked = state;
            }
            updateSettingsFromState();
            //console.log(state);
        });

        toggleTradeAway.on('change', function(e) {
            //console.log(e);
            let input = e.currentTarget.children[0];
            let state = input.checked;
            resource.autoTradeSellEnabled = state;
            let otherCheckbox = document.querySelector('#script_tsell2_' + resource.id + ' input');
            if (otherCheckbox !== null) {
                // @ts-ignore
                otherCheckbox.checked = state;
            }
            updateSettingsFromState();
            //console.log(state);
        });
    }

    function createMarketToggles() {
        // TODO: Find out *why* it draws twice sometimes, and remove this
        removeMarketToggles();

        $("#market .market-item .res").width("5rem");
        $("#market .market-item .trade > :first-child").text("R:");
        $("#market .trade .zero").text("x").css("margin-right", 12);
        for (let i = 0; i < state.marketManager.priorityList.length; i++) {
            createMarketToggle(state.marketManager.priorityList[i]);
        }
    }

    function removeMarketToggles() {
        $("#market .market-item .res").width("7.5rem");
        $("#market .market-item .trade > :first-child").text("Routes:");
        $("#market .trade .zero").text("Cancel Routes").css("margin-right", "");
        $('.ea-market-toggle').remove();
    }

    //#endregion UI

    //#region Utility Functions

    var numberSuffix = {
        K: 1000,
        M: 1000000,
        G: 1000000000,
        T: 1000000000000,
        P: 1000000000000000,
        E: 1000000000000000000,
        Z: 1000000000000000000000,
        Y: 1000000000000000000000000,
    }

    /**
     * @param {string} amountText
     * @return {number}
     */
    function getRealNumber(amountText) {
        if (amountText === "") {
            return 0;
        }

        let numericPortion = parseFloat(amountText);
        let lastChar = amountText[amountText.length - 1];

        if (numberSuffix[lastChar] !== undefined) {
            numericPortion *= numberSuffix[lastChar];
        }

        return numericPortion;
    }

    /**
     * @return {boolean}
     */
    function isMarketUnlocked() {
        return $('#tech-market > .oldTech').length > 0;
    }

    /**
     * @param {string} research
     */
    function isResearchUnlocked(research) {
        return document.querySelector("#tech-" + research + " .oldTech") !== null;
    }

    /**
     * @return {string}
     */
    function getRaceId() {

        let raceNameNode = document.querySelector('#race .name');
        if (raceNameNode === null) {
            return "";
        }

        let race = raceAchievementList.find(race => race.name === raceNameNode.textContent);

        if (!race) {
            if (game !== null) {
                return game.global.race.species;
            } else {
                return "custom";
            }
        }

        return race.id;
    }

    function isHunterRace() {
        return game.global.race[racialTraitCarnivore] || game.global.race[racialTraitSoulEater];
    }

    function isEvilRace() {
        return game.global.race[racialTraitEvil];
    }

    function isEvilUniverse() {
        return game.global.race.universe === "evil";
    }

    function isLumberRace() {
        return !game.global.race[racialTraitKindlingKindred];
    }

    function isIntelligentRace() {
        return game.global.race[racialTraitIntelligent];
    }

    function isForgeRace() {
        return game.global.race[racialTraitForge];
    }

    /**
     * @param {number} govIndex
     */
    function getGovName(govIndex) {
        let govProp = "gov" + govIndex;
        if (typeof game.global.civic.foreign[govProp]['name'] == "undefined") {
            return "foreign power " + (govIndex + 1);
        }

        // Firefox has issues if we use loc(key, variables) directly with variables as the game script won't detect it as an array
        // Something to do with firefox's sandbox for userscripts?
        // Anyway, just perform the replacement ourselves
        let namePart1 = game.loc(`civics_gov${game.global.civic.foreign[govProp].name.s0}`);
        return namePart1.replace("%0", game.global.civic.foreign[govProp].name.s1) + " (" + (govIndex + 1) + ")";
    }

    function getGovPower(govIndex) {
        let govProp = "gov" + govIndex;
        if (game.global.civic.foreign[govProp].spy > 1) {
            // With 2+ spies we know exact number
            return game.global.civic.foreign[govProp].mil;
        } else if (game.global.civic.foreign[govProp].spy === 1) { // Breakpoints taken from foreignGov() -> military(m,i)
            // With 1 spy we know approximate value, let's assume worst in given range
            let mil = game.global.civic.foreign[govProp].mil;
            if (mil < 50) {
                return 50;
            }
            if (mil < 75) {
                return 75;
            }
            if (mil > 200) {
                return 300;
            }
            if (mil > 160) {
                return 200;
            }
            if (mil > 125) {
                return 160;
            }
            return 125
        } else { // Breakpoints taken from clearStates()
            // No information, assume worst for certain gov
            if (govIndex === 0) {
                return 125;
            }
            if (govIndex === 1) {
                return 175;
            }
            if (govIndex === 2) {
                return 300;
            }
        }
    }

    function removePoppers() {
        let poppers = document.querySelectorAll('[id^="pop"]'); // popspace_ and // popspc

        for (let i = 0; i < poppers.length; i++) {
            poppers[i].remove();
        }
    }

    function modifierKeyPressed() {
        return game.keyMultiplier() !== 1;
    }

    /**
     * @param {string} elementId Id of the element that the vue is bound to
     */
    function getVueById(elementId) {
        let element = game.document.getElementById(elementId);
        if (element === null) {
            return undefined;
        }

        if (!element.__vue__) {
            return undefined;
        }

        return element.__vue__;
    }

    var showLogging = false;
    var loggingType = "autoJobs";

    /**
     * @param {string} type
     * @param {string} text
     */
    function log(type, text) {
        if (settings.autoLogging && type === loggingType) {
            console.log(text);
        }
    }

    function logClick(element, reason) {
        log("click", "click " + reason);
        element.click();
    }

    //#endregion Utility Functions

    // Polyfils for unexposed functions

    function spaceFuelAdjust(fuel){ // export function fuel_adjust(fuel){
        if (game.global.race.universe === 'heavy'){
            fuel *= 1.25 + (0.5 * heavyDarkEffect());
        }
        if (state.cityBuildings.MassDriver.stateOnCount > 0){
            fuel *= 0.95 ** state.cityBuildings.MassDriver.stateOnCount;
        }
        if (game.global.stats.achieve['heavyweight']){
            fuel *= 0.96 ** game.global.stats.achieve['heavyweight'].l;
        }
        if (game.global.city.ptrait === 'dense'){
            fuel *= 1.2;
        }
        if (game.global.race['cataclysm']){
            fuel *= 0.2;
        }
        return fuel;
    }

    function intFuelAdjust(fuel){ // export function int_fuel_adjust(fuel)
        if (game.global.race.universe === 'heavy'){
            fuel *= 1.2 + (0.3 * heavyDarkEffect());
        }
        if (game.global.stats.achieve['heavyweight']){
            fuel *= 0.96 ** game.global.stats.achieve['heavyweight'].l;
        }
        return fuel;
    }

    function heavyDarkEffect(){ // export function darkEffect("heavy")
        let de = game.global.race.Dark.count;
        if (game.global.race.Harmony.count > 0){
            de *= 1 + (game.global.race.Harmony.count * 0.01);
        }
        return 0.995 ** de;
    }

    function alevel(){ // export function alevel()
        let a_level = 1;
        if (game.global.race['no_plasmid'] || game.global.race['weak_mastery']){ a_level++; }
        if (game.global.race['no_trade']){ a_level++; }
        if (game.global.race['no_craft']){ a_level++; }
        if (game.global.race['no_crispr']){ a_level++; }
        return a_level;
    }

    function govPrice(govIndex){ // function govPrice(gov)
        let price = game.global.civic.foreign[govIndex].eco * 15384;
        price *= 1 + game.global.civic.foreign[govIndex].hstl * 1.6 / 100;
        price *= 1 - game.global.civic.foreign[govIndex].unrest * 0.25 / 100;
        return +price.toFixed(0);
    }

    // Alt tabbing can leave modifier keys pressed. When the window loses focus release all modifier keys.
    $(window).on('blur', function(e) {
        if (game !== undefined && game.keyMultiplier() > 1){
            document.dispatchEvent(new KeyboardEvent("keyup", {key: game.global.settings.keyMap.x10}));
            document.dispatchEvent(new KeyboardEvent("keyup", {key: game.global.settings.keyMap.x25}));
            document.dispatchEvent(new KeyboardEvent("keyup", {key: game.global.settings.keyMap.x100}));
        }
    });

    window.addEventListener('loadAutoEvolveScript', mainAutoEvolveScript)

    $(document).ready(function() {
        let autoEvolveScriptText = `
        window.game = window.evolve;
        window.dispatchEvent(new CustomEvent('loadAutoEvolveScript'));
        `;

        $('<script>')
        .attr('type', 'module')
        .text(autoEvolveScriptText)
        .appendTo('head');
    });

// @ts-ignore
})($);
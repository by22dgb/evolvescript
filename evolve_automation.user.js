// ==UserScript==
// @name         Evolve
// @namespace    http://tampermonkey.net/
// @version      2.8.1
// @description  try to take over the world!
// @downloadURL  https://gist.github.com/TMVictor/3f24e27a21215414ddc68842057482da/raw/evolve_automation.user.js
// @author       Fafnir
// @author       TMVictor
// @match        https://tmvictor.github.io/Evolve-Scripting-Edition/
// @grant        none
// @require      https://code.jquery.com/jquery-3.4.1.min.js
// @require      https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// ==/UserScript==
//
// DIRECT LINK FOR GREASEMONKEY / TAMPERMONKEY: https://gist.github.com/TMVictor/3f24e27a21215414ddc68842057482da/raw/evolve_automation.user.js
// Just navigate to that link with one of the monkeys installed and it will load the script.
// You can update to latest through the relevent UI for each extension.
//
// This script will NOT WORK WITH THE ORIGINAL VERSION OF THE GAME. It will only work with the scripting edition which can be found at:
// https://tmvictor.github.io/Evolve-Scripting-Edition/
//
// Full release notes at: https://gist.github.com/TMVictor/e2a0634391002888469e79c13c62f60e
// Massive thanks to NotOats for contributing how to access game code directly from GreaseMonkey / TamperMonkey.
//
// * autoEvolution - Runs through the evolution part of the game through to founding a settlement. With no other modifiers it will target Antids.
//          See autoAchievements to target races that you don't have extinction achievements for yet. Settings available in Settings tab.
//  ** autoAchievements - Works through all evolution paths until all race's extinction achievements have been completed (also works with autoChallenge for starred achievements)
//  ** autoChallenge - Chooses ALL challenge options during evolution
// * autoFight - Sends troops to battle whenever Soldiers are full and there are no wounded. Adds to your offensive battalion and switches attach type when offensive
//          rating is greater than the rating cutoff for that attack type.
// * autoCraft - Craft when a specified crafting ratio is met. This changes throughout the game (lower in the beginning and rising as the game progresses)
// * autoBuild - Builds city and space building when it can an production allows (eg. Won't build a Fission Reactor if you don't have enough uranium production).
//          Currently has a few smarts for higher plasmid counts to get certain building built a little bit quicker. eg. If you don't have enough libraries / 
//          cottages / coal mines then it will stop building anything that uses the same materials for a while to allow you to craft the resources to build them.
//          Will only build the buildings that the user enables. Settings available in Settings tab.
// * autoMarket - Allows for automatic buying and selling of resources once specific ratios are met. Also allows setting up trade routes until a minimum
//          specified money per second is reached. The will trade in and out in an attempt to maximise your trade routes. Each resource can be configured
//          in the Market settings in the settings tab.
// * autoStorage - Assigns crates to allow storage of resources. Only assigns enough crates to reach MAD unless enabling autoSpace. Settings available in Settings tab.
// * autoResearch - Performs research when minimum requirements are met. Settings available in Settings tab.
// * autoARPA - Builds ARPA projects if user enables them to be built
// * autoJobs - Assigns jobs in a priority order with multiple breakpoints. Starts with a few jobs each and works up from there. Will try to put a minimum number on
//          lumber / stone then fill up capped jobs first. Settings available in Settings tab.
//  ** autoCraftsmen - Enable this when performing challenge runs and autoJobs will also manage craftsmen
// * autoTax - Adjusts tax rates if your current morale is greater than your maximum allowed morale. Will always keep morale above 100%.
// * autoPower - Manages power based on a priority order of buildings. Starts with city based building then space based. Settings available in Settings tab.
// * autoSmelter - Manages smelter output at different stages at the game. Fuel preferences are available in the Production section of the Settings tab.
// * autoFactory - Manages factory production based on power and consumption. Produces alloys as a priority until nano-tubes then produces those as a priority.
//          Settings available in the Settings tab.
// * autoMiningDroid - Manages mining droid production based on power and consumption. Produces Adamantite only. Not currently user configurable.
// * autoGraphenePlant - Uses what fuel it can to fuel the graphene plant. Not currently user configurable.
// * autoMAD - Once MAD is unlocked will stop sending out troops and will perform MAD
// * autoSpace - Once MAD is unlocked it will start funding the launch facility regardless of arpa settings
// * autoSeeder - Will send out the seeder ship once at least 4 (or user entered max) probes are constructed. Currently tries to find a forest world, then grassland, then the others.
//          Not currently user configurable.
// * autoAssembleGene - Automatically assembles genes only when your knowledge is at max. Stops when DNA Sequencing is researched.
// 

//@ts-check
(function($) {
    'use strict';
    var settings = {};
    var jsonSettings = localStorage.getItem('settings');
    if (jsonSettings !== null) {
        settings = JSON.parse(jsonSettings);
    }

    var game = null;

    var defaultAllOptionsEnabled = false;

    var speciesProtoplasm = "protoplasm";
    var challengeNoCraft = "no_craft";
    var racialTraitCarnivore = "carnivore";
    var racialTraitSoulEater = "soul_eater";
    var racialTraitKindlingKindred = "kindling_kindred";
    var racialTraitIntelligent = "intelligent";
    var racialTraitForge = 'forge';
    var racialTraitHiveMind = "hivemind";
    var racialTraitEvil = "evil";
    var racialTraitSlaver = "slaver"
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

            if (this._remainder >= 25000) {
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
            this._nullJob = { job: "nullJob", display: false, workers: 0, max: 0, impact: 0, name: "None",  };

            // Private properties
            this._originalId = id;
            this._originalName = name;
            this._vueBinding = "civ-" + this._originalId;
            /** @type {{job: string, display: boolean, workers: number, max: number, impact: number}} job */
            this._definition = null;
            
            // Settings
            this._settingJobEnabled = "job_" + this._originalId;

            this.autoJobEnabled = true; // Don't use defaultAllOptionsEnabled. By default assign all new jobs.
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

            return game.craftCost[this._originalId] !== undefined;
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
            if (this.jobOverride !== null) {
               this.jobOverride.setBreakpoint(breakpoint, employees);
            }

            this.breakpointMaxs[breakpoint - 1] = employees;
        }

        /**
         * @param {number} breakpoint
         */
        getBreakpoint(breakpoint) {
            if (this.jobOverride !== null) {
                return this.jobOverride.getBreakpoint(breakpoint);
            }

            return this.breakpointMaxs[breakpoint - 1];
        }

        /**
         * @param {number} breakpoint
         * @param {boolean} [ignoreOverride]
         */
        breakpointEmployees(breakpoint, ignoreOverride) {
            if (this.jobOverride !== null && !ignoreOverride) {
                return this.jobOverride.breakpointEmployees(breakpoint, ignoreOverride);
            }

            if ((breakpoint >= 0 && this.breakpointMaxs.length === 0) || breakpoint < 0 || breakpoint > this.breakpointMaxs.length - 1) {
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
    }

    class CraftingJob extends Job {
        /**
         * @param {string} id
         * @param {string} name
         */
        constructor(id, name) {
            super(id, name);

            this._vueBinding = "foundry";
            this._max = Number.MAX_SAFE_INTEGER;
            this.resource = null;
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

        set max(count) {
            this._max = count;
        }

        get max() {
            if (!this.isUnlocked()) {
                return 0;
            }

            if (this._max === -1) {
                state.jobManager.calculateCraftingMaxs();
            }

            return this._max;
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
    }

    class Action {
        /**
         * @param {string} name
         * @param {string} tab
         * @param {string} id
         * @param {string} location
         */
        constructor(name, tab, id, location) {
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
            
            this.autoBuildEnabled = defaultAllOptionsEnabled;
            this.autoStateEnabled = true;

            if (this._elementId === "spcdock-probes") { // Can't use buildings in the constructor as we are still creating them!
                this._autoMax = 4; // Max of 4 Probes by default
            } else {
                this._autoMax = -1;
            }

            this.priority = 0;

            this.consumption = {
                /** @type {{ resource: Resource, initialRate: number, rate: number, }[]} */
                resourceTypes: [],
            };

            /** @type {ResourceRequirement[]} */
            this.resourceRequirements = [];

            this.setupCache();

            this.overridePowered = undefined;
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
            return document.getElementById(this._elementId) !== null && this.vue !== undefined;
        }

        hasConsumption() {
            return this.definition.hasOwnProperty("powered") || this.consumption.resourceTypes.length > 0;
        }

        get powered() {
            if (this.overridePowered !== undefined) {
                return this.overridePowered;
            }

            return this.definition.hasOwnProperty("powered") ? this.definition.powered() : 0;
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
         * @param {string} prefix
         * @param {string} id
         * @param {boolean} hasStorage
         * @param {boolean} isTradable
         * @param {number} tradeRouteQuantity
         * @param {boolean} isCraftable
         * @param {number} craftRatio
         * @param {boolean} isSupport
         */
        constructor(name, prefix, id, hasStorage, isTradable, tradeRouteQuantity, isCraftable, craftRatio, isSupport) {
            this._prefix = prefix;
            this.name = name;
            this._id = id;
            this._isPopulation = (id === "Population"); // We can't store the full elementId because we don't know the name of the population node until later
            this.autoCraftEnabled = defaultAllOptionsEnabled;

            this._isTradable = isTradable;
            this.tradeRouteQuantity = tradeRouteQuantity;
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

            this.hasStorage = hasStorage;
            this.storagePriority = 0;
            this.autoStorageEnabled = true;
            this.autoStorageWeighting = 0;
            this._autoCratesMax = -1;
            this._autoContainersMax = -1;

            this._isCraftable = isCraftable;
            this.craftRatio = craftRatio;

            this.isSupport = isSupport;

            this.calculatedRateOfChange = 0;

            /** @type {ResourceRequirement[]} */
            this.resourceRequirements = [];

            this._instance = null;

            this.cachedId = "";
            this.setupCache();
        }

        setupCache() {
            this._cachedId = this.id;
            this._elementId = this._prefix + this.id;
            this._extraStorageId = "stack-" + this.id;
            this._storageCountId = "cnt" + this.id;
			
			this._craftAllId = "inc" + this.id + "A";
            
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
            // The population node is special and its id is actually the race name rather than a static name
            if (!this._isPopulation) {
                return this._id;
            }

            return getRaceId();
        }
        
        isUnlocked() {
            if (this._isPopulation) {
                return game.global.resource[this.id].display;
            }

            let containerNode = document.getElementById(this._elementId);
            return containerNode !== null && containerNode.style.display !== "none";
        }

        isManagedStorage() {
            return this.autoStorageEnabled && this.isUnlocked() && this.hasOptions();
        }

        isEjectable() {
            return game.global.interstellar.mass_ejector.hasOwnProperty(this.id);
        }

        /** @return {number} */
        get atomicMass() {
            if (!game.atomic_mass.hasOwnProperty(this.id)) {
                return 0;
            }

            return game.atomic_mass[this.id];
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
        updateStorageState(enabled, weighting, maxCrates, maxContainers) {
            this.autoStorageEnabled = enabled;
            this.autoStorageWeighting = weighting;
            this._autoCratesMax = maxCrates;
            this._autoContainersMax = maxContainers;
        }

        hasOptions() {
            // Options is currently the + button for accessing crates and containers
            if (!this.isUnlocked()) {
                return false;
            }

            let storageNode = document.getElementById(this._extraStorageId);
            return storageNode !== null && storageNode.style.display !== "none";
        }

        get isTradable() {
            return this._isTradable;
        }

        get isCraftable() {
            return this._isCraftable;
        }

        get currentQuantity() {
            if (!this.isUnlocked()) {
                return 0;
            }

            if (this.instance !== undefined) {
                return this.instance.hasOwnProperty("amount") ? this.instance.amount : 0;
            }

            if (game.global.race[this.id]) {
                return game.global.race[this.id].count;
            }

            return 0;
        }

        get maxQuantity() {
            if (!this.isUnlocked()) {
                return 0;
            }

            if (this.instance !== undefined && this.instance.hasOwnProperty("max")) {
                return this.instance.max >= 0 ? this.instance.max : Number.MAX_SAFE_INTEGER;
            }

            // Doesn't have max? Do some tinkering...
            let storageNode = document.getElementById(this._storageCountId);

            // 2 possibilities:
            // eg. "3124.16" there is no max quantity
            // eg. in "1234 / 10.2K" the current quantity is 1234
            if (storageNode === null || storageNode.textContent.indexOf("/") === -1) {
                return Number.MAX_SAFE_INTEGER;
            }

            // eg. in "1234 / 10.2K" the max quantity is 10.2K
            return getRealNumber(storageNode.textContent.split(" / ")[1]);
        }
        
        get storageRatio() {
            // If "326 / 1204" then storage ratio would be 0.27 (ie. storage is 27% full)
            let max = this.maxQuantity;

            if (this.maxQuantity === 0) {
                return 0;
            }

            return this.currentQuantity / max;
        }

        get rateOfChange() {
            if (!this.isUnlocked()) {
                return 0;
            }

            return this.instance !== undefined && this.instance.hasOwnProperty("diff") ? this.instance.diff : 0;
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
            let crates = this.instance.crates;
            return crates !== undefined ? crates : 0;
        }

        get currentContainers() {
            let containers = this.instance.containers;
            return containers !== undefined ? containers : 0;
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

        isCraftingUnlocked() {
            if (!this.isUnlocked()) {
                return false
            }

            return document.getElementById(this._craftAllId) !== null;
        }

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
            super("Power", "", "powerMeter", false, false, -1, false, -1, false);
        }

        //#region Standard resource

        get id() {
            return this._id;
        }

        hasOptions() {
            return false;
        }

        get currentQuantity() {
            if (!this.isUnlocked()) {
                return 0;
            }

            return game.global.city.power; // game.global.city.power_total is the total of all power currently being generated
        }

        get maxQuantity() {
            return Number.MAX_SAFE_INTEGER;
        }
        
        get storageRatio() {
            return this.currentQuantity / this.maxQuantity;
        }

        get rateOfChange() {
            // This isn't really a resource so we'll be super tricky here and set the rate of change to be the available quantity
            return this.currentQuantity;
        }

        //#endregion Standard resource
    }

    class HellArmy extends Resource {
        // This isn't really a resource but we're going to make a dummy one so that we can treat it like a resource
        constructor() {
            super("Hell Army", "", "dummyHellArmy", false, false, -1, false, -1, false);
        }

        //#region Standard resource

        get id() {
            return this._id;
        }

        hasOptions() {
            return false;
        }

        isUnlocked() {
            return game.global['portal'] && game.global.portal['fortress'] && game.global.portal.fortress['garrison'];
        }

        get currentQuantity() {
            if (!this.isUnlocked()) {
                return 0;
            }

            let vue = getVueById('fort');
            return vue === undefined ? 0 : vue.$options.filters.patrolling(game.global.portal.fortress.garrison);
        }

        get maxQuantity() {
            return Number.MAX_SAFE_INTEGER;
        }
        
        get storageRatio() {
            return this.currentQuantity / this.maxQuantity;
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
            super(name, "", id, false, false, -1, false, -1, true);

            this._region = region;
            this._inRegionId = inRegionId;
        }

        //#region Standard resource

        get id() {
            return this._id;
        }

        hasOptions() {
            return false;
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

    class LuxuryGoods extends Resource {
        // This isn't really a resource but we're going to make a dummy one so that we can treat it like a resource
        constructor() {
            super("Luxury Goods", "", "LuxuryGoods", false, false, -1, false, -1, false);
        }

        //#region Standard resource

        get id() {
            return this._id;
        }

        isUnlocked() {
            return true;
        }

        hasOptions() {
            return false;
        }

        get currentQuantity() {
            if (!this.isUnlocked()) {
                return 0;
            }

            // "43/47"
            return 0;
        }

        get maxQuantity() {
            if (!this.isUnlocked()) {
                return 0;
            }

            // "43/47"
            return Number.MAX_SAFE_INTEGER;
        }

        get rateOfChange() {
            // This isn't really a resource so we'll be super tricky here and set the rate of change to be the available quantity
            return 0;
        }

        //#endregion Standard resource
    }

    class SacrificialAlter extends Action {
        constructor() {
            super("Sacrificial Altar", "city", "s_alter", "");
        }

        get autoMax() {
            // Always allow more unless auto max is set to 0
            return this._autoMax === 0 ? 0 : Number.MAX_SAFE_INTEGER;
        }

        // Not overriden but required if overridding the getter
        set autoMax(value) {
            if (value < 0) value = -1;
            this._autoMax = value;
        }
        
        // Whether the action is clickable is determined by whether it is unlocked and affordable
        // The sacrifical alter can be used to sacrifice population to it for a bonues
        // Only allow this when population is full, is greater than 19 and we have less than a day of each bonus
        isClickable() {
            if (!this.isUnlocked()) {
                return false;
            }

            if (this.count === 0) {
                if (!game.checkAffordable(this.definition, false)) {
                    return false;
                }
            } else {
                if (resources.Population.currentQuantity < 20 || resources.Population.currentQuantity !== resources.Population.maxQuantity) {
                    return false;
                } else {
                    return game.global.city.s_alter.rage < 86400 || game.global.city.s_alter.regen < 86400 || game.global.city.s_alter.mind < 86400
                        || game.global.city.s_alter.mine < 86400 || game.global.city.s_alter.harvest < 86400;
                }
            }
            
            return true;
        }
    }

    class SlaveMarket extends Action {
        constructor() {
            super("Slave Market", "city", "slave_market", "");
        }

        get autoMax() {
            // Always allow more unless auto max is set to 0
            return this._autoMax === 0 ? 0 : Number.MAX_SAFE_INTEGER;
        }

        // Not overriden but required if overridding the getter
        set autoMax(value) {
            if (value < 0) value = -1;
            this._autoMax = value;
        }
        
        // Whether the action is clickable is determined by whether it is unlocked and affordable
        // The slave market can always be clicked so lets only do it when we have 90%+ money
        isClickable() {
            if (!this.isUnlocked()) {
                return false;
            }

            // If we have over 90% money...
            if (resources.Money.storageRatio > 0.9 && game.checkAffordable(this.definition, false)) {
                // and we are a slaver with the slave pen unlocked...
                if (game.global.race[racialTraitSlaver] && state.cityBuildings.SlavePen.isUnlocked()){
                    // and we are less than max slaves then we can click!
                    if (state.cityBuildings.SlavePen.count * 5 > game.global.city.slave_pen.slaves) {
                        return true;
                    }
                }
            }
            
            return false;
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

            let func = null;

            if (fuelType === SmelterFuelTypes.Wood) {
                func = this._vue.addWood;
            }

            if (fuelType === SmelterFuelTypes.Coal) {
                func = this._vue.addCoal;
            }

            if (fuelType === SmelterFuelTypes.Oil) {
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

            if (fuelType === SmelterFuelTypes.Wood) {
                func = this._vue.subWood;
            }

            if (fuelType === SmelterFuelTypes.Coal) {
                func = this._vue.subCoal;
            }

            if (fuelType === SmelterFuelTypes.Oil) {
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
                this._productionOptions.push({ seq: 2, goods: FactoryGoods.Alloy, resource: resources.Alloy, enabled: true, weighting: 2, requiredFactories: 0, completed: false });
                this._productionOptions.push({ seq: 3, goods: FactoryGoods.Polymer, resource: resources.Polymer, enabled: false, weighting: 2, requiredFactories: 0, completed: false });
                this._productionOptions.push({ seq: 4, goods: FactoryGoods.NanoTube, resource: resources.Nano_Tube, enabled: true, weighting: 8, requiredFactories: 0, completed: false });
                this._productionOptions.push({ seq: 5, goods: FactoryGoods.Stanene, resource: resources.Stanene, enabled: true, weighting: 8, requiredFactories: 0, completed: false });
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
        none: { id: "none", name: function () { return "None"; } },
        influence: { id: "influence", name: function () { return game.loc("civics_spy_influence"); } },
        sabotage: { id: "sabotage", name: function () { return game.loc("civics_spy_sabotage"); } },
        incite: { id: "incite", name: function () { return game.loc("civics_spy_incite"); } },
        round_robin: { id: "rrobin", name: function () { return "Round Robin"; } },
    };

    class SpyManager {
        constructor() {
            this._espionageToPerform = null;
            this._missions = [ "influence", "sabotage", "incite" ];
            this._roundRobinIndex = [ this._missions.length - 1, this._missions.length - 1, this._missions.length - 1 ];

            /** @type {number[]} */
            this._lastAttackLoop = [ -1000, -1000, -1000 ]; // Last loop counter than we attacked. Don't want to run influence when we are attacking foreign powers
        }

        isUnlocked() {
            let node = document.getElementById("foreign");
            if (!game.global.tech['spy'] || node === null || node.style.display === "none") { return false; }

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
            if (espionageId === espionageTypes.none.id) { return; }
            if (state.windowManager.isOpen()) { return; } // Don't try anything if a window is already open

            let optionsSpan = document.querySelector(`#gov${govIndex} div span:nth-child(3)`);
            // @ts-ignore
            if (optionsSpan.style.display === "none") { return; }

            let optionsNode = document.querySelector(`#gov${govIndex} div span:nth-child(3) button`);
            if (optionsNode === null || optionsNode.getAttribute("disabled") === "disabled") { return; }

            if (espionageId === espionageTypes.round_robin.id) {
                // Round Robin our spy operations. Increment the current spy operation and check if it is useful to perform
                // (It is useful if it will have any effect. If it is already at maximum effect then there is no point in performing it)
                // Keep going until we find a useful operation or we don't have any useful operations to perform
                let missionIndex = this._roundRobinIndex[govIndex];

                // We're NOT looping througn the missions here. We are just looping through the number of missions that there are.
                // Round Robin is keeping track of the current mission itself in this._govMissionIndex[]
                for (let i = 0; i < this._missions.length; i++) {
                    missionIndex++;
                    if (missionIndex > this._missions.length - 1) { missionIndex = 0; }

                    // If we've attacked this foreign power within the last 10 minutes then don't run influence
                    if (this._missions[missionIndex] === espionageTypes.influence.id) {
                        if (state.loopCounter - this._lastAttackLoop[govIndex] < 600) {
                            continue;
                        }
                    }
    
                    if (this.isEspionageUseful(govIndex, this._missions[missionIndex])) {
                        this._espionageToPerform = this._missions[missionIndex];
                        this._roundRobinIndex[govIndex] = missionIndex;
                        break;
                    }
                }
            }

            // User specified spy operation. If it is not already at miximum effect then proceed with it.
            if (espionageId !== espionageTypes.round_robin.id) {
                if (this.isEspionageUseful(govIndex, espionageId)) {
                    this._espionageToPerform = espionageId;
                }
            }

            if (this._espionageToPerform !== null) {
                if (espionageId === espionageTypes.round_robin.id) {
                    state.log.logSuccess(loggingTypes.spying, `Performing ${this._missions[this._roundRobinIndex[govIndex]]} covert operation against ${getGovName(govIndex)}.`)
                } else {
                    state.log.logSuccess(loggingTypes.spying, `Performing "${espionageId}" covert operation against ${getGovName(govIndex)}.`)
                }
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

            if (espionageId === espionageTypes.influence.id) {
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

            if (espionageId === espionageTypes.sabotage.id) {
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

            if (espionageId === espionageTypes.incite.id) {
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
            }
        }

        resetWindowManager() {
            this.openedByScript = false;
            this._callbackWindowTitle = "";
            this._callbackFunction = null;
        }

        checkCallbacks() {
            if (this._closingWindowName !== "") {
                if (document.querySelector('.modal')) {
                    this.closeModalWindow();
                } else {
                    this._closingWindowName = "";
                    this.openedByScript = false;
                }
            }

            // We only care if the script itself opened the modal. If the user did it then ignore it.
            // There must be a call back function otherwise there is nothing to do.
            if (!this.openedByScript && this._callbackFunction !== null) {
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

            this._textArmy = "army";

            this.selectedGovAttackIndex = -1;
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
            let index = findArrayIndex(this.campaignList, "id", campaignId);

            if (index === -1) {
                return;
            }

            this.campaignList[index].rating = campaignMinimumRating;
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
            return game.global.civic.garrison.workers;
        }

        get maxSoldiers() {
            return game.global.civic.garrison.max;
        }

        get woundedSoldiers() {
            return game.global.civic.garrison.wounded;
        }

		get currentCityGarrison() {
			let soldiers = game.global.civic.garrison.workers - game.global.civic.garrison.crew;
		    if (game.global.portal.fortress) {
			    return soldiers - game.global.portal.fortress.garrison;
			}
			else {
			    return soldiers;
			}
		}

		get maxCityGarrison() {
			let soldiers = game.global.civic.garrison.max - game.global.civic.garrison.crew;
		    if (game.global.portal.fortress) {
			    return soldiers - game.global.portal.fortress.garrison;
			}
			else {
			    return soldiers;
			}
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
         * @param {number} govIndex
         */
        getMaxSoldiersForAttackType(govIndex) {
            // armyRating is a Math.floor! We'll have to do some tinkering to get a more accurate rating
            let campaign = this.campaignList[game.global.civic.garrison.tactic];
            let singleSoldierAttackRating = 0;

            if (!game.global.race[racialTraitHiveMind]) {
                // No hivemind so take the army rating to 2 decimal places by getting the rating for all soldiers and dividing it by number of soldiers
                // eg. single soldier = 3.8657. armyRating(1) = floor(3.8657) = 3. armyRating(100) / 100 = 386 / 100 = 3.86
                let soldiers = this.currentCityGarrison - this.woundedSoldiers;
                singleSoldierAttackRating = game.armyRating(soldiers, this._textArmy) / soldiers;

                return Math.ceil(campaign.getMaxRatingForGov(govIndex) / singleSoldierAttackRating);
            }

            // Ok, we've done no hivemind. Hivemind is trickier because each soldier gives attack rating and a bonus to all other soldiers.
            // I'm sure there is an exact mathematical calculation for this but...
            // Just loop through and remove 2 at a time until we're under the max rating.
            let soldiers = Math.min(10, this.currentCityGarrison - this.woundedSoldiers);
            singleSoldierAttackRating = game.armyRating(soldiers, this._textArmy) / soldiers;
            let maxSoldiers = Math.ceil(campaign.getMaxRatingForGov(govIndex) / singleSoldierAttackRating);
            let testMaxSoldiers = maxSoldiers - 2;

            while (testMaxSoldiers > 3 && game.armyRating(testMaxSoldiers, this._textArmy) > campaign.getMaxRatingForGov(govIndex)) {
                maxSoldiers = testMaxSoldiers;
                testMaxSoldiers -= 2;
            }

            return maxSoldiers;
        }

        /**
         * @param {number} govOccupyIndex
         * @param {number} govAttackIndex
         * @param {number} govUnoccupyIndex
         * @return {boolean}
         */
        switchToBestAttackType(govOccupyIndex, govAttackIndex, govUnoccupyIndex) {
            let attackRating = game.armyRating(this.maxCityGarrison, this._textArmy)
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
                } else if (govUnoccupyIndex >= 0) {
                    this.selectedGovAttackIndex = govUnoccupyIndex;
                    //console.log("setting gov index to govUnoccupyIndex")
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

            this.craftingJobs.sort(function (a, b) { return a.priority - b.priority } );
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
                        if (!job.isCraftsman() || (job.isCraftsman() && settings.autoCraftsmen)) {
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

        get breakpointCount() {
            // We're getting the count of how many breakpoints we have so just use the normal list and get the first one
            return this.priorityList[0].breakpointMaxs.length;
        }

        /**
         * @param {number} breakpoint
         */
        actualForBreakpoint(breakpoint) {
            if (breakpoint < 0 || breakpoint > 1) {
                return 0;
            }

            let total = 0;
            let jobList = this.managedPriorityList();

            for (let i = 0; i < jobList.length; i++) {
                total += Math.max(0, jobList[i].breakpointEmployees(breakpoint, false));
            }

            return total;
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
            return managedCrafters;
        }

        get currentCraftsmen() {
            return game.global.city.foundry.crafting;
        }

        get maxCraftsmen() {
            return game.global.civic.craftsman.max;
        }

        calculateCraftingMaxs() {
            if (!this.isFoundryUnlocked()) {
                return;
            }

            let max = this.maxCraftsmen;
            let remainingJobs = [];

            for (let i = 0; i < this.craftingJobs.length; i++) {
                const job = this.craftingJobs[i];

                if (!settings['craft' + job.resource.id]) {
                    // The job isn't unlocked or the user has said to not craft the resource associated with this job
                    job.max = 0;
                } else if (job === state.jobs.Brick && state.cityBuildings.CementPlant.count === 0) {
                    // We've got no cement plants so don't put any craftsmen on making Brick
                    job.max = 0;
                } else if (!job.isManaged()) {
                    // The user has said to not manage this job
                    job.max = job.count;
                    max -= job.count;
                } else {
                    let setting = parseInt(settings['job_b3_' + job._originalId]);
                    if (setting >= 0) {
                        // The user has set a specific max for this job so we'll honour it
                        job.max = Math.min(setting, max);
                        max -= job.max;
                    } else {
                        remainingJobs.push(job);
                    }
                }
            }

            // Divide the remaining jobs between the remaining crafting jobs
            let remainingWorkersToAssign = max;

            for (let i = 0; i < remainingJobs.length; i++) {
                const job = remainingJobs[i];
                job.max = Math.floor(max / remainingJobs.length);
                remainingWorkersToAssign -= job.max;
            }

            if (remainingWorkersToAssign > 0) {
                for (let i = 0; i < remainingJobs.length; i++) {
                    if (remainingWorkersToAssign > 0) {
                        const job = remainingJobs[i];
                        job.max++;
                        remainingWorkersToAssign--;
                    }
                }
            }
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
    
                    if (building.isUnlocked() && building.autoBuildEnabled) {
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
                    if (building.hasState() && building.autoStateEnabled) {
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

            this._definition = game.arpaProjects[this.id];

            return this._definition;
        }

        // This is the resource requirements for 100% of the project
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
                let moneyFloor = 0;
                let moneyRequirement = this.resourceRequirements.find(requirement => requirement.resource === resources.Money);
                if (moneyRequirement !== undefined) {
                    moneyFloor = moneyRequirement.quantity / 100; // We are building in steps of 1%
                }

                if (wouldBreakMoneyFloor(moneyFloor)) {
                    return false;
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
            let marketTest = document.getElementById("market-qty");
            return marketTest !== null && marketTest.style.display !== "none";
        }

        clearPriorityList() {
            this.priorityList.length = 0;
            this._sortedTradeRouteSellList.length = 0;
        }

        /**
         * @param {Resource} resource
         */
        addResourceToPriorityList(resource) {
            if (resource.isTradable) {
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
            isResearchUnlocked("containerization");
        }

        clearPriorityList() {
            this.priorityList.length = 0;
            this._managedPriorityList.length = 0;
        }

        /**
         * @param {Resource} resource
         */
        addResourceToPriorityList(resource) {
            if (resource.hasStorage) {
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
    
                    if (resource.isManagedStorage()) {
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
    }

    class Race {
        /**
         * @param {String} id
         * @param {String} name
         * @param {boolean} isEvolutionConditional
         * @param {string} evolutionConditionText
         * @param {string} achievementText
         */
        constructor(id, name, isEvolutionConditional, evolutionConditionText, achievementText) {
            this.id = id;
            this.name = name;
            this.isEvolutionConditional = isEvolutionConditional;
            this.evolutionConditionText = evolutionConditionText;
            this.achievementText = achievementText;

            /** @type {Action[]} */
            this.evolutionTree = [];
        }

        /**
         * @param {number} [level]
         */
        isMadAchievementUnlocked(level) {
            // Can't get these in a micro universe - can only get micro specific achievements
            if (game.global.race.universe === 'micro') {
                return true;
            }

            // check if achievement exists and what star level
            // Levels 1,2,3,4,5
            let madAchievement = "extinct_" + this.id;

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
            }

            if (game.global.stats.achieve[madAchievement] && game.global.stats.achieve[madAchievement][universe]) {
                if (game.global.stats.achieve[madAchievement][universe] >= level) {
                    return true;
                }
            }

            return false;
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
         * @param {string} type
         * @param {string} requirementType
         * @param {string} requirementId
         * @param {number} requirementCount
         * @param {string} actionType
         * @param {string} actionId
         * @param {number} actionCount
         */
        constructor(seq, priority, type, requirementType, requirementId, requirementCount, actionType, actionId, actionCount) {
            this.seq = seq;
            this.priority = priority;

            this.type = type;

            this.requirementType = requirementType;
            this.requirementId = requirementId;
            this.requirementCount = requirementCount;

            this.actionType = actionType;
            this.actionId = actionId;
            this.actionCount = actionCount;

            this.complete = false;
        }

        get cost() {
            if (this.actionType === "research") {
                return tech[this.actionId].definition.cost;
            }
        }

        isActionPossible() {
            if (this.actionType === "research") {
                // check against MAX as we want to know if it is possible...
                return tech[this.actionId].isUnlocked() && game.checkAffordable(tech[this.actionId].definition, true);
            }
        }

        /** @return {boolean} */
        updateComplete() {
            if (this.complete) {
                return false;
            }

            if (this.type === "tech") {
                if (this.requirementType === "unlocked") {
                    if (tech[this.actionId].isResearched()) {
                        this.complete = true;
                        return true;
                    }
                }
            }

            return false;
        }

        areRequirementsMet() {
            if (this.type === "tech") {
                if (this.requirementType === "unlocked") {
                    if (tech[this.actionId].isUnlocked()) {
                        return true;
                    }
                }
            }

            return false;
        }

        /** @param {string} type */
        updateType(type) {
            if (type === this.type) {
                return;
            }

            this.type = type;
            this.complete = false;

            if (this.type === "tech") {
                this.requirementType = "unlock";
                this.requirementId = "club";
                this.requirementCount = 0;
                this.actionType = "research";
                this.actionId = "club";
                this.actionCount = 0;
                return;
            }

            if (this.type === "bld") {
                this.requirementType = "";
                this.requirementId = "";
                this.requirementCount = 0;
                this.actionType = "";
                this.actionId = "";
                this.actionCount = 0;
                return;
            }
        }

        /** @param {string} requirementType */
        updateRequirementType(requirementType) {
            if (requirementType === this.requirementType) {
                return;
            }

            this.requirementType = requirementType;
            this.complete = false;

            if (this.type === "tech") {
                if (this.requirementType === "unlocked") {
                    this.requirementId = "club";
                    this.requirementCount = 0;
                    this.actionType = "research";
                    this.actionId = "club";
                    this.actionCount = 0;
                    return;
                }

                if (this.requirementType === "researched") {
                    this.requirementId = "";
                    this.requirementCount = 0;
                    this.actionType = "";
                    this.actionId = "";
                    this.actionCount = 0;
                    return;
                }
            }

            this.requirementId = "";
            this.requirementCount = 0;
            this.actionType = "";
            this.actionId = "";
            this.actionCount = 0;
            return;
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

            this.actionId = "";
            this.actionCount = 0;
            return;
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
                    if (!trigger.complete && trigger.isActionPossible() && !this.actionConflicts(trigger)) {
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
            let index = findArrayIndex(this.priorityList, "seq", seq);

            if (index === -1) {
                return null;
            }

            return this.priorityList[index];
        }

        clearPriorityList() {
            this.priorityList.length = 0;
        }

        sortByPriority() {
            this.priorityList.sort(function (a, b) { return a.priority - b.priority } );
        }

        /** @return {Trigger} */
        AddTrigger(type, requirementType, requirementId, requirementCount, actionType, actionId, actionCount) {
            let trigger = new Trigger(this.priorityList.length, this.priorityList.length, type, requirementType, requirementId, requirementCount, actionType, actionId, actionCount);
            this.priorityList.push(trigger);
            return trigger;
        }

        AddTriggerFromSetting(seq, priority, type, requirementType, requirementId, requirementCount, actionType, actionId, actionCount) {
            let existingSequence = findArrayIndex(this.priorityList, "seq", seq);

            if (existingSequence === -1) {
                let trigger = new Trigger(seq, priority, type, requirementType, requirementId, requirementCount, actionType, actionId, actionCount);
                this.priorityList.push(trigger);
            }
        }

        /** @param {number} seq */
        RemoveTrigger(seq) {
            let indexToRemove = findArrayIndex(this.priorityList, "seq", seq);

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
                //@ts-ignore
                if (Object.keys(targetTrigger.cost).some(resource => Object.keys(building.definition.cost).includes(resource))) {

                    //console.log("building " + building.id + " CONFLICTS with target")
                    return true;
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
            if (Object.keys(targetTrigger.cost).some(resource => Object.keys(project.definition.cost).includes(resource))) {

                //console.log("building " + building.id + " CONFLICTS with target")
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

    var races = {
        antid: new Race("antid", "Antid", false, "", "Ophiocordyceps Unilateralis"),
        mantis: new Race("mantis", "Mantis", false, "", "Praying Unanswered"),
        scorpid: new Race("scorpid", "Scorpid", false, "", "Pulmonoscorpius"),
        human: new Race("human", "Human", false, "", "Homo Adeadus"),
        orc: new Race("orc", "Orc", false, "", "Outlander"),
        elven: new Race("elven", "Elf", false, "", "The few, the proud, the dead"),
        troll: new Race("troll", "Troll", false, "", "Bad Juju"),
        ogre: new Race("orge", "Ogre", false, "", "Too stupid to live"),
        cyclops: new Race("cyclops", "Cyclops", false, "", "Blind Ambition"),
        kobold: new Race("kobold", "Kobold", false, "", "Took their candle"),
        goblin: new Race("goblin", "Goblin", false, "", "Greed before Need"),
        gnome: new Race("gnome", "Gnome", false, "", "Unathletic"),
        cath: new Race("cath", "Cath", false, "", "Saber Tooth Tiger"),
        wolven: new Race("wolven", "Wolven", false, "", "Dire Wolf"),
        centaur: new Race("centaur", "Centaur", false, "", "Ferghana"),
        balorg: new Race("balorg", "Balorg", true, "Hellscape planet", "Self immolation"),
        imp: new Race("imp", "Imp", true, "Hellscape planet", "Deal with the devil"),
        seraph: new Race("seraph", "Seraph", true, "Eden planet", "Fallen Angel"),
        unicorn: new Race("unicorn", "Unicorn", true, "Eden planet", "Unicorn Burgers"),
        arraak: new Race("arraak", "Arraak", false, "", "Way of the Dodo"),
        pterodacti: new Race("pterodacti", "Pterodacti", false, "", "Chicxulub"),
        dracnid: new Race("dracnid", "Dracnid", false, "", "Desolate Smaug"),
        tortoisan: new Race("tortoisan", "Tortoisan", false, "", "Circle of Life"),
        gecko: new Race("gecko", "Gecko", false, "", "No Savings"),
        slitheryn: new Race("slitheryn", "Slitheryn", false, "", "Final Shedding"),
        sharkin: new Race("sharkin", "Sharkin", true, "Oceanic planet", "Megalodon"),
        octigoran: new Race("octigoran", "Octigoran", true, "Oceanic planet", "Calamari"),
        entish: new Race("entish", "Ent", false, "", "Saruman's Revenge"),
        cacti: new Race("cacti", "Cacti", false, "", "Desert Deserted"),
        sporgar: new Race("sporgar", "Sporgar", false, "", "Fungicide"),
        shroomi: new Race("shroomi", "Shroomi", false, "", "Bad Trip"),
        junker: new Race("junker", "Valdi", true, "Challenge genes unlocked", "Euthanasia"),
        dryad: new Race("dryad", "Dryad", true, "Forest planet", "Ashes to Ashes"),
        satyr: new Race("satyr", "Satyr", true, "Forest planet", "Stopped the music"),
        phoenix: new Race("phoenix", "Phoenix", true, "Volcanic planet", "Snuffed"),
        salamander: new Race("salamander", "Salamander", true, "Volcanic planet", "Cooled Off"),
        yeti: new Race("yeti", "Yeti", true, "Tundra planet", "Captured"),
        wendigo: new Race("wendigo", "Wendigo", true, "Tundra planet", "Soulless Abomination"),
        tuskin: new Race("tuskin", "Tuskin", true, "Desert planet", "Startled"),
        kamel: new Race("kamel", "Kamel", true, "Desert planet", "No Oasis"),
        custom: new Race("custom", "Custom", true, "Custom designed race", "Lab Failure"),
    }

    /** @type {Race[]} */
    var raceAchievementList = [
        races.antid, races.mantis, races.scorpid, races.human, races.orc, races.elven, races.troll, races.ogre, races.cyclops,
        races.kobold, races.goblin, races.gnome, races.cath, races.wolven, races.centaur, races.balorg, races.imp, races.seraph, races.unicorn,
        races.arraak, races.pterodacti, races.dracnid, races.tortoisan, races.gecko, races.slitheryn, races.sharkin, races.octigoran,
        races.entish, races.cacti, races.sporgar, races.shroomi, races.junker, races.dryad, races.satyr, races.phoenix, races.salamander,
        races.yeti, races.wendigo, races.tuskin, races.kamel, races.custom
    ];

    var resources = {
        // Evolution resources
        RNA: new Resource("RNA", "res", "RNA", false, false, -1, false, -1, false),
        DNA: new Resource("DNA", "res", "DNA", false, false, -1, false, -1, false),

        // Base resources
        Money: new Resource("Money", "res", "Money", false, false, -1, false, -1, false),
        Population: new Resource("Population", "res", "Population", false, false, -1, false, -1, false), // The population node is special and its id will change to the race name
        Slave: new Resource("Slave", "res", "Slave", false, false, -1, false, -1, false),
        Knowledge: new Resource("Knowledge", "res", "Knowledge", false, false, -1, false, -1, false),
        Crates: new Resource("Crates", "res", "Crates", false, false, -1, false, -1, false),
        Containers: new Resource("Containers", "res", "Containers", false, false, -1, false, -1, false),
        Plasmid: new Resource("Plasmid", "res", "Plasmid", false, false, -1, false, -1, false),
        Antiplasmid: new Resource("Anti-Plasmid", "res", "AntiPlasmid", false, false, -1, false, -1, false),
        Phage: new Resource("Phage", "res", "Phage", false, false, -1, false, -1, false),
        Dark: new Resource("Dark", "res", "Dark", false, false, -1, false, -1, false),
        Harmony: new Resource("Harmony", "res", "Harmony", false, false, -1, false, -1, false),
        Genes: new Resource("Genes", "res", "Genes", false, false, -1, false, -1, false),

        // Special not-really-resources-but-we'll-treat-them-like-resources resources
        Power: new Power(),
        HellArmy: new HellArmy(),
        Luxury_Goods: new LuxuryGoods(),
        Moon_Support: new Support("Moon Support", "srspc_moon", "space", "spc_moon"),
        Red_Support: new Support("Red Support", "srspc_red", "space", "spc_red"),
        Sun_Support: new Support("Sun Support", "srspc_sun", "space", "spc_sun"),
        Belt_Support: new Support("Belt Support", "srspc_belt", "space", "spc_belt"),
        Alpha_Support: new Support("Alpha Support", "srint_alpha", "interstellar", "int_alpha"),
        Nebula_Support: new Support("Nebula Support", "srint_nebula", "interstellar", "int_nebula"),

        // Basic resources (can trade for these)
        Food: new Resource("Food", "res", "Food", true, true, 2, false, -1, false),
        Lumber: new Resource("Lumber", "res", "Lumber", true, true, 2,false, -1, false),
        Stone: new Resource("Stone", "res", "Stone", true, true, 2, false, -1, false),
        Furs: new Resource("Furs", "res", "Furs", true, true, 1, false, -1, false),
        Copper: new Resource("Copper", "res", "Copper", true, true, 1, false, -1, false),
        Iron: new Resource("Iron", "res", "Iron", true, true, 1, false, -1, false),
        Aluminium: new Resource("Aluminium", "res", "Aluminium", true, true, 1, false, -1, false),
        Cement: new Resource("Cement", "res", "Cement", true, true, 1, false, -1, false),
        Coal: new Resource("Coal", "res", "Coal", true, true, 1, false, -1, false),
        Oil: new Resource("Oil", "res", "Oil", false, true, 0.5, false, -1, false),
        Uranium: new Resource("Uranium", "res", "Uranium", false, true, 0.25, false, -1, false),
        Steel: new Resource("Steel", "res", "Steel", true, true, 0.5, false, -1, false),
        Titanium: new Resource("Titanium", "res", "Titanium", true, true, 0.25, false, -1, false),
        Alloy: new Resource("Alloy", "res", "Alloy", true, true, 0.2, false, -1, false),
        Polymer: new Resource("Polymer", "res", "Polymer", true, true, 0.2, false, -1, false),
        Iridium: new Resource("Iridium", "res", "Iridium", true, true, 0.1, false, -1, false),
        Helium_3: new Resource("Helium-3", "res", "Helium_3", false, true, 0.1, false, -1, false),

        // Advanced resources (can't trade for these)
        Elerium: new Resource("Elerium", "res", "Elerium", false, false, 0.02, false, -1, false),
        Neutronium: new Resource("Neutronium", "res", "Neutronium", false, false, 0.05, false, -1, false),
        Nano_Tube: new Resource("Nano Tube", "res", "Nano_Tube", false, false, 0.1, false, -1, false),

        // Interstellar
        Deuterium: new Resource("Deuterium", "res", "Deuterium", false, false, 0.1, false, -1, false),
        Adamantite: new Resource("Adamantite", "res", "Adamantite", true, false, 0.05, false, -1, false),
        Infernite: new Resource("Infernite", "res", "Infernite", false, false, 0.01, false, -1, false),
        Graphene: new Resource("Graphene", "res", "Graphene", true, false, 0.1, false, -1, false),
        Stanene: new Resource("Stanene", "res", "Stanene", true, false, 0.1, false, -1, false),
        Soul_Gem: new Resource("Soul Gem", "res", "Soul_Gem", false, false, -1, false, -1, false),

        // Andromeda
        Bolognium: new Resource("Bolognium", "res", "Bolognium", true, false, 0.1, false, -1, false),
        Vitreloy: new Resource("Vitreloy", "res", "Vitreloy", true, false, 0.1, false, -1, false),
        Orichalcum: new Resource("Orichalcum", "res", "Orichalcum", true, false, 0.1, false, -1, false),
        
        // Craftable resources
        Plywood: new Resource("Plywood", "res", "Plywood", false, false, -1, true, 0.5, false),
        Brick: new Resource("Brick", "res", "Brick", false, false, -1, true, 0.5, false),
        Wrought_Iron: new Resource("Wrought Iron", "res", "Wrought_Iron", false, false, -1, true, 0.5, false),
        Sheet_Metal: new Resource("Sheet Metal", "res", "Sheet_Metal", false, false, -1, true, 0.5, false),
        Mythril: new Resource("Mythril", "res", "Mythril", false, false, -1, true, 0.5, false),
        Aerogel: new Resource("Aerogel", "res", "Aerogel", false, false, -1, true, 0.5, false),
        Nanoweave: new Resource("Nanoweave", "res", "Nanoweave", false, false, -1, true, 0.5, false),
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
        triggerManager: new TriggerManager(),
        governmentManager: new GovernmentManager(),
        spyManager: new SpyManager(),

        minimumMoneyAllowed: 0,
        
        lastStorageBuildCheckLoop: 0,
        lastSmelterCheckLoop: 0,
        
        goal: "Standard",

        /** @type {Resource[]} */
        allResourceList: [],

        /** @type {Resource[]} */
        craftableResourceList: [],

        jobs: {
            Farmer: new Job("farmer", "Farmer"),
            Lumberjack: new Job("lumberjack", "Lumberjack"),
            QuarryWorker: new Job("quarry_worker", "Quarry Worker"),
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
            Plywood: new CraftingJob("Plywood", "Plywood Crafter"),
            Brick: new CraftingJob("Brick", "Brick Crafter"),
            WroughtIron: new CraftingJob("Wrought_Iron", "Wrought Iron Crafter"),
            SheetMetal: new CraftingJob("Sheet_Metal", "Sheet Metal Crafter"),
            Mythril: new CraftingJob("Mythril", "Mythril Crafter"),
            Aerogel: new CraftingJob("Aerogel", "Aerogel Crafter"),
            Nanoweave: new CraftingJob("Nanoweave", "Nanoweave Crafter"),
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
                                    Ogre: new EvolutionAction("", "evo", "orge", ""),
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


                Chitin: new EvolutionAction("", "evo", "chitin", ""),
                    //Multicellular: new EvolutionAction("", "evo", "multicellular", ""),
                        Spores: new EvolutionAction("", "evo", "spores", ""),
                            //Bryophyte: new EvolutionAction("", "evo", "bryophyte", ""),
                                Sporgar: new EvolutionAction("", "evo", "sporgar", ""),
                                Shroomi: new EvolutionAction("", "evo", "shroomi", ""),


            //Bunker: new EvolutionAction("", "evo", "bunker", ""),
            Bunker: new ChallengeEvolutionAction("", "evo", "bunker", "", ""),
            Plasmid: new ChallengeEvolutionAction("Plasmid", "evo", "plasmid", "", "no_plasmid"),
            Trade: new ChallengeEvolutionAction("Trade", "evo", "trade", "", "no_trade"),
            Craft: new ChallengeEvolutionAction("Craft", "evo", "craft", "", "no_craft"),
            Crispr: new ChallengeEvolutionAction("Crispr", "evo", "crispr", "", "no_crispr"),
            Mastery: new ChallengeEvolutionAction("Mastery", "evo", "mastery", "", "weak_mastery"),
            Joyless: new ChallengeEvolutionAction("Joyless", "evo", "joyless", "", "joyless"),
            Decay: new ChallengeEvolutionAction("Decay", "evo", "decay", "", "decay"),
            Junker: new ChallengeEvolutionAction("Junker", "evo", "junker", "", ""),
            Steelen: new ChallengeEvolutionAction("Steelen", "evo", "steelen", "", "steelen"),
            EmField: new ChallengeEvolutionAction("EM Field", "evo", "emfield", "", "emfield"),

        },// weak_mastery

        /** @type {Race[][]} */
        raceGroupAchievementList: [ [] ],
        /** @type {ChallengeEvolutionAction[]} */
        evolutionChallengeList: [],

        /** @type {Race} */
        evolutionTarget: null,
        resetEvolutionTarget: false,
        /** @type {Race} */
        evolutionFallback: null,
        
        cityBuildings: {
            Food: new Action("Food", "city", "food", ""),
            Lumber: new Action("Lumber", "city", "lumber", ""),
            Stone: new Action("Stone", "city", "stone", ""),

            Slaughter: new Action("Slaughter", "city", "slaughter", ""),
            SacrificialAltar: new SacrificialAlter(), // special click properties

            University: new Action("University", "city", "university", ""),
            Wardenclyffe: new Action("Wardenclyffe", "city", "wardenclyffe", ""),
            Mine: new Action("Mine", "city", "mine", ""),
            CoalMine: new Action("Coal Mine", "city", "coal_mine", ""),
            Smelter: new Smelter(), // has options
            CoalPower: new Action("Coal Powerplant", "city", "coal_power", ""),
            Temple: new Action("Temple", "city", "temple", ""),
            OilWell: new Action("Oil Derrick", "city", "oil_well", ""),
            BioLab: new Action("Bioscience Lab", "city", "biolab", ""),
            StorageYard: new Action("Freight Yard", "city", "storage_yard", ""),
            Warehouse: new Action("Container Port", "city", "warehouse", ""),
            OilPower: new Action("Oil Powerplant", "city", "oil_power", ""),
            Bank: new Action("Bank", "city", "bank", ""),
            Barracks: new Action("Barracks", "city", "garrison", ""),
            Hospital: new Action("Hospital", "city", "hospital", ""),
            BootCamp: new Action("Boot Camp", "city", "boot_camp", ""),
            House: new Action("Cabin", "city", "house", ""),
            Cottage: new Action("Cottage", "city", "cottage", ""),
            Apartment: new Action("Apartment", "city", "apartment", ""),
            Farm: new Action("Farm", "city", "farm", ""),
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
            Library: new Action("Library", "city", "library", ""),
            Sawmill: new Action("Sawmill", "city", "sawmill", ""),
            FissionPower: new Action("Fission Reactor", "city", "fission_power", ""),
            Lodge: new Action("Lodge", "city", "lodge", ""),
            Smokehouse: new Action("Smokehouse", "city", "smokehouse", ""),
            Casino: new Action("Casino", "city", "casino", ""),
            TouristCenter: new Action("Tourist Center", "city", "tourist_center", ""),
            MassDriver: new Action("Mass Driver", "city", "mass_driver", ""),
            Wharf: new Action("Wharf", "city", "wharf", ""),
            MetalRefinery: new Action("Metal Refinery", "city", "metal_refinery", ""),
            SlavePen: new Action("Slave Pen", "city", "slave_pen", ""),
            SlaveMarket: new SlaveMarket(),
            Graveyard: new Action ("Graveyard", "city", "graveyard", ""),
            Shrine: new Action ("Shrine", "city", "shrine", ""),
        },
        
        spaceBuildings: {
            // Space
            SpaceTestLaunch: new Action("Test Launch", "space", "test_launch", "spc_home"),
            SpaceSatellite: new Action("Space Satellite", "space", "satellite", "spc_home"),
            SpaceGps: new Action("Space Gps", "space", "gps", "spc_home"),
            SpacePropellantDepot: new Action("Space Propellant Depot", "space", "propellant_depot", "spc_home"),
            SpaceNavBeacon: new Action("Space Navigation Beacon", "space", "nav_beacon", "spc_home"),
            
            // Moon
            MoonMission: new Action("Moon Mission", "space", "moon_mission", "spc_moon"),
            MoonBase: new Action("Moon Base", "space", "moon_base", "spc_moon"),
            MoonIridiumMine: new Action("Moon Iridium Mine", "space", "iridium_mine", "spc_moon"),
            MoonHeliumMine: new Action("Moon Helium-3 Mine", "space", "helium_mine", "spc_moon"),
            MoonObservatory: new Action("Moon Observatory", "space", "observatory", "spc_moon"),
            
            // Red
            RedMission: new Action("Red Mission", "space", "red_mission", "spc_red"),
            RedSpaceport: new Action("Red Spaceport", "space", "spaceport", "spc_red"),
            RedTower: new Action("Red Space Control", "space", "red_tower", "spc_red"),
            RedLivingQuarters: new Action("Red Living Quarters", "space", "living_quarters", "spc_red"),
            RedVrCenter: new Action("Red VR Center", "space", "vr_center", "spc_red"),
            RedGarage: new Action("Red Garage", "space", "garage", "spc_red"),
            RedMine: new Action("Red Mine", "space", "red_mine", "spc_red"),
            RedFabrication: new Action("Red Fabrication", "space", "fabrication", "spc_red"),
            RedFactory: new Action("Red Factory", "space", "red_factory", "spc_red"),
            RedBiodome: new Action("Red Biodome", "space", "biodome", "spc_red"),
            RedExoticLab: new Action("Red Exotic Materials Lab", "space", "exotic_lab", "spc_red"),
            RedSpaceBarracks: new Action("Red Marine Barracks", "space", "space_barracks", "spc_red"),
            RedZiggurat: new Action("Red Ziggurat", "space", "ziggurat", "spc_red"),
            
            // Hell
            HellMission: new Action("Hell Mission", "space", "hell_mission", "spc_hell"),
            HellGeothermal: new Action("Hell Geothermal Plant", "space", "geothermal", "spc_hell"),
            HellSwarmPlant: new Action("Hell Swarm Plant", "space", "swarm_plant", "spc_hell"),
            
            // Sun
            SunMission: new Action("Sun Mission", "space", "sun_mission", "spc_sun"),
            SunSwarmControl: new Action("Sun Control Station", "space", "swarm_control", "spc_sun"),
            SunSwarmSatellite: new Action("Sun Swarm Satellite", "space", "swarm_satellite", "spc_sun"),
            
            // Gas
            GasMission: new Action("Gas Mission", "space", "gas_mission", "spc_gas"),
            GasMining: new Action("Gas Helium-3 Collector", "space", "gas_mining", "spc_gas"),
            GasStorage: new Action("Gas Fuel Depot", "space", "gas_storage", "spc_gas"),
            GasSpaceDock: new SpaceDock(), // has options
            GasSpaceDockProbe: new ModalAction("Gas Space Probe", "spcdock", "probes", "", "starDock"),
            GasSpaceDockShipSegment: new ModalAction("Gas Bioseeder Ship Segment", "spcdock", "seeder", "", "starDock"),
            GasSpaceDockPrepForLaunch: new ModalAction("Gas Prep Ship", "spcdock", "prep_ship", "", "starDock"),
            GasSpaceDockLaunch: new ModalAction("Gas Launch Ship", "spcdock", "launch_ship", "", "starDock"),
            
            // Gas moon
            GasMoonMission: new Action("Gas Moon Mission", "space", "gas_moon_mission", "spc_gas_moon"),
            GasMoonOutpost: new Action("Gas Moon Mining Outpost", "space", "outpost", "spc_gas_moon"),
            GasMoonDrone: new Action("Gas Moon Mining Drone", "space", "drone", "spc_gas_moon"),
            GasMoonOilExtractor: new Action("Gas Moon Oil Extractor", "space", "oil_extractor", "spc_gas_moon"),
            
            // Belt
            BeltMission: new Action("Belt Mission", "space", "belt_mission", "spc_belt"),
            BeltSpaceStation: new Action("Belt Space Station", "space", "space_station", "spc_belt"),
            BeltEleriumShip: new Action("Belt Elerium Mining Ship", "space", "elerium_ship", "spc_belt"),
            BeltIridiumShip: new Action("Belt Iridium Mining Ship", "space", "iridium_ship", "spc_belt"),
            BeltIronShip: new Action("Belt Iron Mining Ship", "space", "iron_ship", "spc_belt"),
            
            // Dwarf
            DwarfMission: new Action("Dwarf Mission", "space", "dwarf_mission", "spc_dwarf"),
            DwarfEleriumContainer: new Action("Dwarf Elerium Storage", "space", "elerium_contain", "spc_dwarf"),
            DwarfEleriumReactor: new Action("Dwarf Elerium Reactor", "space", "e_reactor", "spc_dwarf"),
            DwarfWorldCollider: new Action("Dwarf World Collider", "space", "world_collider", "spc_dwarf"),
            DwarfWorldController: new Action("Dwarf WSC Control", "space", "world_controller", "spc_dwarf"),

            AlphaMission: new Action("Alpha Centauri Mission", "interstellar", "alpha_mission", "int_alpha"),
            AlphaStarport: new Action("Alpha Starport", "interstellar", "starport", "int_alpha"),
            AlphaHabitat: new Action("Alpha Habitat", "interstellar", "habitat", "int_alpha"),
            AlphaMiningDroid: new MiningDroid(), // has options
            AlphaProcessing: new Action("Alpha Processing", "interstellar", "processing", "int_alpha"),
            AlphaFusion: new Action("Alpha Fusion", "interstellar", "fusion", "int_alpha"),
            AlphaLaboratory: new Action("Alpha Laboratory", "interstellar", "laboratory", "int_alpha"),
            AlphaExchange: new Action("Alpha Exchange", "interstellar", "exchange", "int_alpha"),
            AlphaFactory: new GraphenePlant(), // has options
            AlphaWarehouse: new Action("Alpha Warehouse", "interstellar", "warehouse", "int_alpha"),
            AlphaMegaFactory: new Action("Alpha Mega Factory", "interstellar", "int_factory", "int_alpha"),
            AlphaLuxuryCondo: new Action("Alpha Luxury Condo", "interstellar", "luxury_condo", "int_alpha"),

            ProximaMission: new Action("Proxima Mission", "interstellar", "proxima_mission", "int_proxima"),
            ProximaTransferStation: new Action("Proxima Transfer Station", "interstellar", "xfer_station", "int_proxima"),
            ProximaCargoYard: new Action("Proxima Cargo Yard", "interstellar", "cargo_yard", "int_proxima"),
            ProximaCruiser: new Action("Proxima Cruiser", "interstellar", "cruiser", "int_proxima"),
            ProximaDyson: new Action("Proxima Dyson", "interstellar", "dyson", "int_proxima"),
            ProximaDysonSphere: new Action("Proxima Dyson Sphere", "interstellar", "dyson_sphere", "int_proxima"),

            NebulaMission: new Action("Nebula Mission", "interstellar", "nebula_mission", "int_nebula"),
            NebulaNexus: new Action("Nebula Nexus", "interstellar", "nexus", "int_nebula"),
            NebulaHarvestor: new Action("Nebula Harvester", "interstellar", "harvester", "int_nebula"),
            NebulaEleriumProspector: new Action("Nebula Elerium Prospector", "interstellar", "elerium_prospector", "int_nebula"),

            NeutronMission: new Action("Neutron Mission", "interstellar", "neutron_mission", "int_neutron"),
            NeutronMiner: new Action("Neutron Miner", "interstellar", "neutron_miner", "int_neutron"),
            NeutronCitadel: new Action("Neutron Citadel Station", "interstellar", "citadel", "int_neutron"),
            NeutronStellarForge: new Action("Neutron Stellar Forge", "interstellar", "stellar_forge", "int_neutron"),

            Blackhole: new Action("Blackhole Mission", "interstellar", "blackhole_mission", "int_blackhole"),
            BlackholeFarReach: new Action("Blackhole Far Reach", "interstellar", "far_reach", "int_blackhole"),
            BlackholeStellarEngine: new Action("Blackhole Stellar Engine", "interstellar", "stellar_engine", "int_blackhole"),
            BlackholeMassEjector: new Action("Blackhole Mass Ejector", "interstellar", "mass_ejector", "int_blackhole"),

            BlackholeJumpShip: new Action("Blackhole Jump Ship", "interstellar", "jump_ship", "int_blackhole"),
            BlackholeWormholeMission: new Action("Blackhole Wormhole Mission", "interstellar", "wormhole_mission", "int_blackhole"),
            BlackholeStargate: new Action("Blackhole Stargate", "interstellar", "stargate", "int_blackhole"),
            BlackholeCompletedStargate: new Action("Blackhole Completed Stargate", "interstellar", "s_gate", "int_blackhole"),

            SiriusMission: new Action("Sirius Mission", "interstellar", "sirius_mission", "int_sirius"),
            SiriusAnalysis: new Action("Sirius B Analysis", "interstellar", "sirius_b", "int_sirius"),
            SiriusSpaceElevator: new Action("Sirius Space Elevator", "interstellar", "space_elevator", "int_sirius"),
            SiriusGravityDome: new Action("Sirius Gravity Dome", "interstellar", "gravity_dome", "int_sirius"),
            SiriusAscensionMachine: new Action("Sirius Ascension Machine", "interstellar", "ascension_machine", "int_sirius"),
            SiriusAscensionTrigger: new Action("Sirius Ascension Trigger", "interstellar", "ascension_trigger", "int_sirius"),
            SiriusAscend: new Action("Sirius Ascend", "interstellar", "ascend", "int_sirius"),
            SiriusThermalCollector: new Action("Sirius ThermalCollector", "interstellar", "thermal_collector", "int_sirius"),

            PortalTurret: new Action("Portal Laser Turret", "portal", "turret", "prtl_fortress"),
            PortalCarport: new Action("Portal Surveyor Carport", "portal", "carport", "prtl_fortress"),
            PortalWarDroid: new Action("Portal War Droid", "portal", "war_droid", "prtl_fortress"),
            PortalRepairDroid: new Action("Portal Repair Droid", "portal", "repair_droid", "prtl_fortress"),

            PortalWarDrone: new Action("Portal Predator Drone", "portal", "war_drone", "prtl_badlands"),
            PortalSensorDrone: new Action("Portal Sensor Drone", "portal", "sensor_drone", "prtl_badlands"),
            PortalAttractor: new Action("Portal Attractor Beacon", "portal", "attractor", "prtl_badlands"),

            PortalPitMission: new Action("Portal Pit Mission", "portal", "pit_mission", "prtl_pit"),
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
        resetMarketState();
        resetStorageState();

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

        // Lets set our crate / container resource requirements
        resources.Crates.resourceRequirements.push(new ResourceRequirement(resources.Plywood, 10));
        resources.Containers.resourceRequirements.push(new ResourceRequirement(resources.Steel, 125));

        // Construct all resource list
        state.allResourceList = state.marketManager.priorityList.concat(state.craftableResourceList);
        state.allResourceList.push(resources.Money);
        state.allResourceList.push(resources.Population);
        state.allResourceList.push(resources.Knowledge);
        state.allResourceList.push(resources.Crates);
        state.allResourceList.push(resources.Containers);
        state.allResourceList.push(resources.Plasmid);
        state.allResourceList.push(resources.Genes);
        state.allResourceList.push(resources.Power);
        state.allResourceList.push(resources.HellArmy);
        state.allResourceList.push(resources.Moon_Support);
        state.allResourceList.push(resources.Red_Support);
        state.allResourceList.push(resources.Sun_Support);
        state.allResourceList.push(resources.Belt_Support);
        state.allResourceList.push(resources.Alpha_Support);
        state.allResourceList.push(resources.Nebula_Support);
        state.allResourceList.push(resources.Neutronium);
        state.allResourceList.push(resources.Elerium);
        state.allResourceList.push(resources.Nano_Tube);

        state.jobs.Plywood.resource = resources.Plywood;
        state.jobManager.addCraftingJob(state.jobs.Plywood);
        state.jobs.Brick.resource = resources.Brick;
        state.jobManager.addCraftingJob(state.jobs.Brick);
        state.jobs.WroughtIron.resource = resources.Wrought_Iron;
        state.jobManager.addCraftingJob(state.jobs.WroughtIron);
        state.jobs.SheetMetal.resource = resources.Sheet_Metal;
        state.jobManager.addCraftingJob(state.jobs.SheetMetal);
        state.jobs.Mythril.resource = resources.Mythril;
        state.jobManager.addCraftingJob(state.jobs.Mythril);
        state.jobs.Aerogel.resource = resources.Aerogel;
        state.jobManager.addCraftingJob(state.jobs.Aerogel);
        state.jobs.Nanoweave.resource = resources.Nanoweave;
        state.jobManager.addCraftingJob(state.jobs.Nanoweave);

        resetJobState();
        
        // Construct city builds list
        state.cityBuildings.House.specialId = "basic_housing";

        state.cityBuildings.SacrificialAltar.gameMax = 1;
        state.spaceBuildings.GasSpaceDock.gameMax = 1;
        state.spaceBuildings.DwarfWorldController.gameMax = 1;
        state.spaceBuildings.GasSpaceDockShipSegment.gameMax = 100;
        state.spaceBuildings.ProximaDyson.gameMax = 100;
        state.spaceBuildings.BlackholeStellarEngine.gameMax = 100;
        state.spaceBuildings.DwarfWorldCollider.gameMax = 1859;

        state.spaceBuildings.ProximaDysonSphere.gameMax = 100;
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
        state.cityBuildings.CoalPower.addResourceConsumption(resources.Coal, 0.35);
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

        resetProjectState();
        resetWarState();
        resetProductionState();
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
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'gigantism') {
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
        raceGroup = [ races.entish, races.cacti ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'plant') {
            races.custom.evolutionTree = [e.Custom].concat(chloroplasts)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);

        let chitin = [e.Sentience, e.Bryophyte, e.Spores, e.Multicellular, e.Chitin, e.SexualReproduction];
        races.sporgar.evolutionTree = [e.Sporgar].concat(chitin);
        races.shroomi.evolutionTree = [e.Shroomi].concat(chitin);
        raceGroup = [ races.sporgar, races.shroomi ];
        if (game.races['custom'] && game.races.custom.hasOwnProperty('type') && game.races.custom.type === 'fungi') {
            races.custom.evolutionTree = [e.Custom].concat(chitin)
            raceGroup.push(races.custom);
        }
        state.raceGroupAchievementList.push(raceGroup);
    }

    function resetWarSettings() {
        settings.foreignSpyManage = true;
        settings.foreignAttackLivingSoldiersPercent = 100;
        settings.foreignAttackHealthySoldiersPercent = 100;
        settings.foreignHireMercMoneyStoragePercent = 90;
        settings.foreignHireMercCostLowerThan = 50000;

        settings.foreignAttack0 = true;
        settings.foreignOccupy0 = true;
        settings.foreignSpy0 = true;
        settings.foreignSpyMax0 = 3;
        settings.foreignSpyOp0 = "rrobin";

        settings.foreignAttack1 = true;
        settings.foreignOccupy1 = true;
        settings.foreignSpy1 = true;
        settings.foreignSpyMax1 = 3;
        settings.foreignSpyOp1 = "rrobin";

        settings.foreignAttack2 = true;
        settings.foreignOccupy2 = true;
        settings.foreignSpy2 = true;
        settings.foreignSpyMax2 = 3;
        settings.foreignSpyOp2 = "rrobin";
    }

    function resetWarState() {
        state.warManager.clearCampaignList();

        state.warManager.addToCampaignList("Ambush", 10, 20);
        state.warManager.addToCampaignList("Raid", 50, 100);
        state.warManager.addToCampaignList("Pillage", 100, 180);
        state.warManager.addToCampaignList("Assault", 200, 360);
        state.warManager.addToCampaignList("Siege", 500, 800);
    }

    function resetGeneralSettings() {
        // None at the moment - moved to government settings
    }

    function resetPrestigeSettings() {
        settings.autoMAD = false;

        settings.autoSpace = false;
        settings.prestigeBioseedConstruct = false;
        settings.autoSeeder = false;
        settings.prestigeBioseedProbes = 3;

        settings.prestigeWhiteholeReset = false;
        settings.prestigeWhiteholeMinMass = 8;
        settings.prestigeWhiteholeStabiliseMass = true;
        settings.prestigeWhiteholeEjectEnabled = true;
        settings.prestigeWhiteholeEjectAllCount = 5;
    }

    function resetGovernmentSettings() {
        settings.generalMinimumTaxRate = 20;
        settings.generalMinimumMorale = 105;
        settings.generalMaximumMorale = 200;
        settings.govManage = false;
        settings.govInterim = governmentTypes.democracy.id;
        settings.govFinal = governmentTypes.technocracy.id;
    }

    function resetEvolutionSettings() {
        settings.userEvolutionTargetName = "auto";
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
    }

    function resetResearchSettings() {
        settings.userResearchTheology_1 = "auto";
        settings.userResearchTheology_2 = "auto";
        settings.userResearchUnification = "auto";
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
        state.marketManager.addResourceToPriorityList(resources.Stone);
        state.marketManager.addResourceToPriorityList(resources.Lumber);
        state.marketManager.addResourceToPriorityList(resources.Food);

        resources.Food.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 10);
        resources.Lumber.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 10);
        resources.Stone.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 20);
        resources.Furs.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 10);
        resources.Copper.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 10);
        resources.Iron.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 20);
        resources.Aluminium.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 10);
        resources.Cement.updateMarketState(false, 0.3, false, 0.9, false, 0, true, 10);
        resources.Coal.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 10);
        resources.Oil.updateMarketState(false, 0.5, false, 0.9, true, 5, false, 10);
        resources.Uranium.updateMarketState(false, 0.5, false, 0.9, true, 2, false, 10);
        resources.Steel.updateMarketState(false, 0.5, false, 0.9, false, 0, true, 10);
        resources.Titanium.updateMarketState(false, 0.8, false, 0.9, true, 50, false, 10);
        resources.Alloy.updateMarketState(false, 0.8, false, 0.9, true, 50, false, 10);
        resources.Polymer.updateMarketState(false, 0.8, false, 0.9, true, 50, false, 10);
        resources.Iridium.updateMarketState(false, 0.8, false, 0.9, true, 50, false, 10);
        resources.Helium_3.updateMarketState(false, 0.8, false, 0.9, true, 50, false, 10);
    }

    function resetMarketSettings() {
        settings.tradeRouteMinimumMoneyPerSecond = 200
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

        resources.Food.updateStorageState(true, 0, -1, -1);
        resources.Lumber.updateStorageState(true, 1, -1, -1);
        resources.Stone.updateStorageState(true, 1, -1, -1);
        resources.Furs.updateStorageState(true, 1, -1, -1);
        resources.Copper.updateStorageState(true, 1, -1, -1);
        resources.Iron.updateStorageState(true, 1, -1, -1);
        resources.Aluminium.updateStorageState(true, 1, -1, -1);
        resources.Cement.updateStorageState(true, 1, -1, -1);
        resources.Coal.updateStorageState(true, 1, -1, -1);
        resources.Steel.updateStorageState(true, 2, -1, -1);
        resources.Titanium.updateStorageState(true, 1, -1, -1);
        resources.Alloy.updateStorageState(true, 1, -1, -1);
        resources.Polymer.updateStorageState(true, 1, -1, -1);
        resources.Iridium.updateStorageState(true, 1, -1, -1);
        resources.Adamantite.updateStorageState(true, 1, -1, -1);
        resources.Graphene.updateStorageState(true, 1, -1, -1);
        resources.Stanene.updateStorageState(true, 1, -1, -1);
        resources.Bolognium.updateStorageState(true, 1, -1, -1);
        resources.Vitreloy.updateStorageState(true, 1, -1, -1);
        resources.Orichalcum.updateStorageState(true, 1, -1, -1);
    }

    function resetStorageSettings() {
        settings.storageLimitPreMad = true;
    }

    function resetJobSettings() {
        settings.jobLumberWeighting = 50;
        settings.jobQuarryWeighting = 50;
        settings.jobScavengerWeighting = 50;
    }

    function resetJobState() {
        state.jobManager.clearPriorityList();

        state.jobManager.addJobToPriorityList(state.jobs.Farmer);
        state.jobManager.addJobToPriorityList(state.jobs.Lumberjack);
        state.jobManager.addJobToPriorityList(state.jobs.QuarryWorker);
        state.jobManager.addJobToPriorityList(state.jobs.Scavenger);
        state.jobManager.addJobToPriorityList(state.jobs.Plywood);
        state.jobManager.addJobToPriorityList(state.jobs.Brick);
        state.jobManager.addJobToPriorityList(state.jobs.WroughtIron);
        state.jobManager.addJobToPriorityList(state.jobs.SheetMetal);
        state.jobManager.addJobToPriorityList(state.jobs.Mythril);
        state.jobManager.addJobToPriorityList(state.jobs.Aerogel);
        state.jobManager.addJobToPriorityList(state.jobs.Nanoweave);
        state.jobManager.addJobToPriorityList(state.jobs.Entertainer);
        state.jobManager.addJobToPriorityList(state.jobs.Scientist);
        state.jobManager.addJobToPriorityList(state.jobs.Professor);
        state.jobManager.addJobToPriorityList(state.jobs.CementWorker);
        state.jobManager.addJobToPriorityList(state.jobs.Miner);
        state.jobManager.addJobToPriorityList(state.jobs.CoalMiner);
        state.jobManager.addJobToPriorityList(state.jobs.Banker);
        state.jobManager.addJobToPriorityList(state.jobs.Colonist);
        state.jobManager.addJobToPriorityList(state.jobs.SpaceMiner);
        state.jobManager.addJobToPriorityList(state.jobs.HellSurveyor);
        state.jobManager.addJobToPriorityList(state.jobs.Priest);

        state.jobs.Farmer.breakpointMaxs = [0, 0, 0]; // Farmers are calculated based on food rate of change only, ignoring cap
        state.jobs.Lumberjack.breakpointMaxs = [5, 10, 10]; // Lumberjacks, scavengers and quarry workers are special - remaining worker divided between them
        state.jobs.QuarryWorker.breakpointMaxs = [5, 10, 10]; // Lumberjacks, scavengers and quarry workers are special - remaining worker divided between them
        state.jobs.Scavenger.breakpointMaxs = [0, 0, 10]; // Lumberjacks, scavengers and quarry workers are special - remaining worker divided between them

        state.jobs.SheetMetal.breakpointMaxs = [2, 4, -1];
        state.jobs.Plywood.breakpointMaxs = [2, 4, -1];
        state.jobs.Brick.breakpointMaxs = [2, 4, -1];
        state.jobs.WroughtIron.breakpointMaxs = [2, 4, -1];
        state.jobs.Mythril.breakpointMaxs = [2, 4, -1];
        state.jobs.Aerogel.breakpointMaxs = [1, 1, 1];
        state.jobs.Nanoweave.breakpointMaxs = [1, 1, 1];

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
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Casino);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.TouristCenter);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.RockQuarry);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Sawmill);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedVrCenter);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusAscensionMachine);

        for (let i = 0; i < state.buildingManager.priorityList.length; i++) {
            const building = state.buildingManager.priorityList[i];
            
            if (building.settingId === "spcdock-probes") {
                building._autoMax = 4;
            } else {
                building._autoMax = -1;
            }
        }
    }

    function resetProjectSettings() {
        settings.arpaBuildIfStorageFull = true;
        settings.arpaBuildIfStorageFullCraftableMin = 50000;
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
            if (production.goods === FactoryGoods.Alloy) production.weighting = 2;
            if (production.goods === FactoryGoods.Polymer) {
                production.weighting = 2;
                production.enabled = false;
            }
            if (production.goods === FactoryGoods.NanoTube) production.weighting = 8;
            if (production.goods === FactoryGoods.Stanene) production.weighting = 8;
        }
    }

    function resetTriggerSettings() {

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

    initialiseState();

    var settingsSections = ["generalSettingsCollapsed", "prestigeSettingsCollapsed", "evolutionSettingsCollapsed", "researchSettingsCollapsed", "marketSettingsCollapsed", "storageSettingsCollapsed",
                            "productionSettingsCollapsed", "warSettingsCollapsed", "jobSettingsCollapsed", "buildingSettingsCollapsed", "projectSettingsCollapsed",
                            "governmentSettingsCollapsed", "loggingSettingsCollapsed"];
    
    function updateStateFromSettings() {
        updateStandAloneSettings();

        if (!settings["triggers"]) {
            settings.triggers = [];
        }

        state.triggerManager.clearPriorityList();
        settings.triggers.forEach(trigger => {
            state.triggerManager.AddTriggerFromSetting(trigger.seq, trigger.priority, trigger.type, trigger.requirementType, trigger.requirementId, trigger.requirementCount, trigger.actionType, trigger.actionId, trigger.actionCount);
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

            settingKey = 'res_storage' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.autoStorageEnabled = settings[settingKey]; }
            else { settings[settingKey] = resource.autoStorageEnabled; }

            settingKey = 'res_storage_w_' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.autoStorageWeighting = parseFloat(settings[settingKey]); }
            else { settings[settingKey] = resource.autoStorageWeighting; }

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
        state.marketManager.sortByPriority();

        for (let i = 0; i < state.storageManager.priorityList.length; i++) {
            let resource = state.storageManager.priorityList[i];

            let settingKey = 'res_storage' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.autoStorageEnabled = settings[settingKey]; }
            else { settings[settingKey] = resource.autoStorageEnabled; }

            settingKey = 'res_storage_w_' + resource.id;
            if (settings.hasOwnProperty(settingKey)) { resource.autoStorageWeighting = parseFloat(settings[settingKey]); }
            else { settings[settingKey] = resource.autoStorageWeighting; }

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

        // Retrieve settings for crafting resources
        for (let i = 0; i < state.craftableResourceList.length; i++) {
            let settingKey = 'craft' + state.craftableResourceList[i].id;
            if (settings.hasOwnProperty(settingKey)) {
                state.craftableResourceList[i].autoCraftEnabled = settings[settingKey];
            } else {
                settings[settingKey] = defaultAllOptionsEnabled;
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
        }
        state.buildingManager.sortByPriority();

        // Retrieve settings for assigning jobs
        for (let i = 0; i < state.jobManager.priorityList.length; i++) {
            const job = state.jobManager.priorityList[i];

            let settingKey = 'job_' + job._originalId;
            if (settings.hasOwnProperty(settingKey)) {
                job.autoJobEnabled = settings[settingKey];
            } else {
                settings[settingKey] = true; // Don't use defaultAllOptionsEnabled. By default assign all new jobs.
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

        if (!settings.hasOwnProperty('arpa')) {
            settings.arpa = {
                //lhc: false,
                //stock_exchange: false,
                //monument: false,
                //launch_facility: false,
            };
        }

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

        // Remove old building settings... We had to update these with the prefix as well as building ids started to have duplicates
        for (let i = 0; i < state.buildingManager.priorityList.length; i++) {
            const building = state.buildingManager.priorityList[i];
            if (settings.hasOwnProperty('bat' + building.id)) { delete settings['bat' + building.id]; }
            if (settings.hasOwnProperty('bld_p_' + building.id)) { delete settings['bld_p_' + building.id]; }
            if (settings.hasOwnProperty('bld_s_' + building.id)) { delete settings['bld_s_' + building.id]; }
            if (settings.hasOwnProperty('bld_m_' + building.id)) { delete settings['bld_m_' + building.id]; }
            
            delete settings['bld_p_' + building.id];
            delete settings['bld_s_' + building.id];
            delete settings['bld_m_' + building.id];
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
        }
        
        for (let i = 0; i < state.craftableResourceList.length; i++) {
            settings['craft' + state.craftableResourceList[i].id] = state.craftableResourceList[i].autoCraftEnabled;
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
            settings['res_storage_w_' + resource.id] = resource.autoStorageWeighting;
            settings['res_storage_p_' + resource.id] = resource.storagePriority;
            settings['res_crates_m_' + resource.id] = resource._autoCratesMax;
            settings['res_containers_m_' + resource.id] = resource._autoContainersMax;
        }

        if (!settings.hasOwnProperty('arpa')) {
            settings.arpa = {
                //lhc: false,
                //stock_exchange: false,
                //monument: false,
                //launch_facility: false,
            };
        }

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

        addSetting("storageLimitPreMad", true);
        addSetting("arpaBuildIfStorageFull", true);
        addSetting("arpaBuildIfStorageFullCraftableMin", 50000);
        addSetting("arpaBuildIfStorageFullResourceMaxPercent", 5);

        addSetting("productionMoneyIfOnly", true);

        addSetting("jobLumberWeighting", 50);
        addSetting("jobQuarryWeighting", 50);
        addSetting("jobScavengerWeighting", 50);

        addSetting("masterScriptToggle", true);
        addSetting("autoEvolution", defaultAllOptionsEnabled);
        addSetting("autoAchievements", false);
        addSetting("autoChallenge", false);
        addSetting("autoMarket", defaultAllOptionsEnabled);
        addSetting("autoFight", defaultAllOptionsEnabled);
        addSetting("autoCraft", defaultAllOptionsEnabled);
        addSetting("autoARPA", defaultAllOptionsEnabled);
        addSetting("autoBuild", defaultAllOptionsEnabled);
        addSetting("autoResearch", defaultAllOptionsEnabled);
        addSetting("autoJobs", defaultAllOptionsEnabled);
        addSetting("autoTax", defaultAllOptionsEnabled);
        addSetting("autoCraftsmen", defaultAllOptionsEnabled);
        addSetting("autoPower", defaultAllOptionsEnabled);
        addSetting("autoStorage", defaultAllOptionsEnabled);

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

        addSetting("buildingStateAll", defaultAllOptionsEnabled);
        addSetting("buildingStateAll", defaultAllOptionsEnabled);
        addSetting("autoSmelter", defaultAllOptionsEnabled);
        addSetting("autoFactory", defaultAllOptionsEnabled);
        addSetting("autoMiningDroid", defaultAllOptionsEnabled);
        addSetting("autoGraphenePlant", defaultAllOptionsEnabled);
        addSetting("autoMAD", false);
        addSetting("autoSpace", false);
        addSetting("prestigeBioseedConstruct", false);
        addSetting("autoSeeder", false);
        addSetting("prestigeBioseedProbes", 3);
        addSetting("prestigeWhiteholeReset", false);
        addSetting("prestigeWhiteholeMinMass", 8);
        addSetting("prestigeWhiteholeStabiliseMass", true);
        addSetting("prestigeWhiteholeEjectEnabled", true);
        addSetting("prestigeWhiteholeEjectAllCount", 5);

        addSetting("autoAssembleGene", false);
        addSetting("genesAssembleGeneAlways", false);

        addSetting("minimumMoney", 0);
        addSetting("minimumMoneyPercentage", 0);
        addSetting("tradeRouteMinimumMoneyPerSecond", 300);
        addSetting("generalMinimumTaxRate", 20);
        addSetting("generalMinimumMorale", 105)
        addSetting("generalMaximumMorale", 200);
        addSetting("govManage", false);
        addSetting("govInterim", governmentTypes.democracy.id);
        addSetting("govFinal", governmentTypes.technocracy.id);

        addSetting("foreignSpyManage", true);
        addSetting("foreignAttackLivingSoldiersPercent", 100);
        addSetting("foreignAttackHealthySoldiersPercent", 100);
        addSetting("foreignHireMercMoneyStoragePercent", 90);
        addSetting("foreignHireMercCostLowerThan", 50000);

        addSetting("foreignAttack0", true);
        addSetting("foreignOccupy0", true);
        addSetting("foreignSpy0", true);
        addSetting("foreignSpyMax0", 3);
        addSetting("foreignSpyOp0", "rrobin");

        addSetting("foreignAttack1", true);
        addSetting("foreignOccupy1", true);
        addSetting("foreignSpy1", true);
        addSetting("foreignSpyMax1", 3);
        addSetting("foreignSpyOp1", "rrobin");

        addSetting("foreignAttack2", true);
        addSetting("foreignOccupy2", true);
        addSetting("foreignSpy2", true);
        addSetting("foreignSpyMax2", 3);
        addSetting("foreignSpyOp2", "rrobin");

        addSetting("userEvolutionTargetName", "auto");

        for (let i = 0; i < state.evolutionChallengeList.length; i++) {
            const challenge = state.evolutionChallengeList[i];
            
            if (challenge.id !== state.evolutions.Bunker.id) {
                addSetting("challenge_" + challenge.id, false);
            }
        }

        addSetting("userResearchTheology_1", "auto");
        addSetting("userResearchTheology_2", "auto");
        addSetting("userResearchUnification", "auto");
        
        addSetting("buildingEnabledAll", false);
        addSetting("buildingStateAll", false);

        // Collapse or expand settings sections
        for (let i = 0; i < settingsSections.length; i++) {
            addSetting(settingsSections[i], true);
        }
    }

    // #endregion State and Initialisation

    //#region Auto Evolution

    function autoEvolution() {
        if (game.global.race.species !== speciesProtoplasm) {
            return;
        }

        // If we have performed a soft reset with a bioseeded ship then we get to choose our planet
        autoPlanetSelection();

        if (settings.autoChallenge) {
            for (let i = 0; i < state.evolutionChallengeList.length; i++) {
                const challenge = state.evolutionChallengeList[i];

                if (challenge === state.evolutions.Bunker || settings["challenge_" + challenge.id]) {
                    if (!game.global.race[challenge.effectId] || game.global.race[challenge.effectId] !== 1) {
                        challenge.click(1)
                    }
                }
            }
        }

        if (state.resetEvolutionTarget) {
            state.evolutionTarget = null;
            state.resetEvolutionTarget = false;
        }

        // If the user has specified a target evolution then use that
        if (state.evolutionTarget === null && settings.userEvolutionTargetName != "auto") {
            state.evolutionTarget = raceAchievementList[findArrayIndex(raceAchievementList, "name", settings.userEvolutionTargetName)];
            state.evolutionFallback = races.antid;

            state.log.logSuccess(loggingTypes.special, `Attempting user chosen evolution of ${state.evolutionTarget.name}.`);
        } else if (state.evolutionTarget === null) {
            // User has automatic race selection enabled - Antids or autoAchievements
            state.evolutionTarget = races.antid;
            state.evolutionFallback = races.antid;

            if (settings.autoAchievements) {
                // Determine star level based on selected challenges and use it to check if achievements for that level have been... achieved
                let achievementLevel = 1;

                if (settings.autoChallenge) {
                    if (settings.challenge_plasmid || settings.challenge_mastery) achievementLevel++;
                    if (settings.challenge_trade) achievementLevel++;
                    if (settings.challenge_craft) achievementLevel++;
                    if (settings.challenge_crispr) achievementLevel++;
                }

                let targetedGroup = { group: null, race: null, remainingPercent: 0 };
                let fallbackGroup = { group: null, race: null, remainingPercent: 0 };

                for (let i = 0; i < state.raceGroupAchievementList.length; i++) {
                    const raceGroup = state.raceGroupAchievementList[i];
                    let remainingAchievements = 0;
                    let remainingRace = null;
                    
                    for (let j = 0; j < raceGroup.length; j++) {
                        const race = raceGroup[j];
                        if (!race.isMadAchievementUnlocked(achievementLevel) && !race.isEvolutionConditional) { // Just ignore conditional races for now
                            remainingRace = race;
                            remainingAchievements++;
                        }
                    }

                    // We'll target the group with the highest percentage chance of getting an achievement
                    let remainingPercent = remainingAchievements / raceGroup.length;

                    // If this group has the most races left with remaining achievements then target an uncompleted race in this group
                    if (remainingPercent > targetedGroup.remainingPercent) {
                        targetedGroup.group = raceGroup;
                        targetedGroup.race = remainingRace;
                        targetedGroup.remainingPercent = remainingPercent;
                    }

                    // Just in case the targeted race has a condition attached (eg. acquatic requires an ocean world) then have a fallback... just in case
                    if (remainingPercent > fallbackGroup.remainingPercent && !remainingRace.isEvolutionConditional) {
                        fallbackGroup.group = raceGroup;
                        fallbackGroup.race = remainingRace;
                        fallbackGroup.remainingPercent = remainingPercent;
                    }
                }

                if (targetedGroup.group != null) { state.evolutionTarget = targetedGroup.race; }
                if (fallbackGroup.group != null) { state.evolutionFallback = fallbackGroup.race; }
            }

            state.log.logSuccess(loggingTypes.special, `Attempting evolution of ${state.evolutionTarget.name}.`);
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

        // If we can't find our targeted evolution then use the fallback (eg. our target is an Aquatic race but we're not on an ocean planet)
        if (!targetedEvolutionFound && state.evolutionTarget.isEvolutionConditional) {
            for (let i = 0; i < state.evolutionFallback.evolutionTree.length; i++) {
                if (state.evolutionFallback.evolutionTree[i].click(1)) {
                    // If we successfully click the action then return to give the ui some time to refresh
                    return;
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

    function autoPlanetSelection() {
        // This section is for if we bioseeded life and we get to choose our path a little bit
        let potentialPlanets = document.querySelectorAll('#evolution .action');
        let selectedPlanet = "";
        
        selectedPlanet = evolutionPlanetSelection(potentialPlanets, "Grassland");
        if (selectedPlanet === "") { selectedPlanet = evolutionPlanetSelection(potentialPlanets, "Forest"); }
        if (selectedPlanet === "") { selectedPlanet = evolutionPlanetSelection(potentialPlanets, "Oceanic"); }
        if (selectedPlanet === "") { selectedPlanet = evolutionPlanetSelection(potentialPlanets, "Desert"); }
        if (selectedPlanet === "") { selectedPlanet = evolutionPlanetSelection(potentialPlanets, "Volcanic"); }
        if (selectedPlanet === "") { selectedPlanet = evolutionPlanetSelection(potentialPlanets, "Tundra"); }

        // This one is a little bit special. We need to trigger the "mouseover" first as it creates a global javascript varaible
        // that is then destroyed in the "click"
        if (selectedPlanet !== "") {
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
                updateCraftRatio(craftable);

                let tryCraft = true;

                //console.log("resource: " + craftable.id + ", length: " + craftable.requiredResources.length);
                for (let i = 0; i < craftable.resourceRequirements.length; i++) {
                    //console.log("resource: " + craftable.id + " required resource: " + craftable.requiredResources[i].id);
                    if (craftable.resourceRequirements[i].resource.storageRatio < craftable.craftRatio) {
                        tryCraft = false;
                    }
                }

                if (tryCraft) {
                    craftable.tryCraftX(5);
                }
            }
        }
    }

    /**
     * @param {Resource} craftable
     */
    function updateCraftRatio(craftable) {
        // We want to get to a healthy number of buildings that require craftable materials so leaving crafting ratio low early
        if (craftable === resources.Plywood) {
            craftable.craftRatio = 0.9;
            
            if (state.cityBuildings.Library.count < 20 || state.cityBuildings.Cottage.count < 20) {
                craftable.craftRatio = 0.5;
            }
        }
        
        if (craftable === resources.Brick) {
            craftable.craftRatio = 0.9;
            
            if (state.cityBuildings.Library.count < 20 || state.cityBuildings.Cottage.count < 20) {
                craftable.craftRatio = 0.5;
            }
        }
        
        if (craftable === resources.Wrought_Iron) {
            craftable.craftRatio = 0.9;
            
            if (state.cityBuildings.Cottage.count < 20) {
                craftable.craftRatio = 0.5;
            }
        }
        
        if (craftable === resources.Sheet_Metal) {
            craftable.craftRatio = 0.9;
            
            if (state.cityBuildings.Wardenclyffe.count < 20) {
                craftable.craftRatio = 0.5;
            }
        }
    }

    //#endregion Auto Crafting

    //#region Manage Government

    function manageGovernment() {
        if (!settings.govManage) { return; }

        let gm = state.governmentManager;
        if (!gm.isEnabled()) { return; }

        // Check and set final government if possible
        if (gm.currentGovernment === settings.govFinal) { return; }

        if (gm.currentGovernment !== settings.govFinal && gm.isGovernmentUnlocked(settings.govFinal)) {
            gm.setGovernment(settings.govFinal);
            return;
        }

        // Check and set interim government if possible
        if (gm.currentGovernment === settings.govInterim) { return; }

        if (gm.currentGovernment !== settings.govInterim && gm.isGovernmentUnlocked(settings.govInterim)) {
            gm.setGovernment(settings.govInterim);
            return;
        }
    }

    //#endregion Manage Government

    function manageSpies() {
        if (!settings.foreignSpyManage) { return; }

        let foreignVue = getVueById("foreign");
        
        if (foreignVue === undefined) { return; }
        if (!game.global.tech['spy'] || !foreignVue.vis()) { return; }

        buySpyWithMyLittleEye(foreignVue, 0);
        buySpyWithMyLittleEye(foreignVue, 1);
        buySpyWithMyLittleEye(foreignVue, 2);

        if (!state.spyManager.isUnlocked()) { return; }

        performEspionageOperation(0);
        performEspionageOperation(1);
        performEspionageOperation(2);
    }

    /**
     * @param {{ spy_disabled: (arg0: any) => any; spy: (arg0: any) => void; }} foreignVue
     * @param {number} govIndex
     */
    function buySpyWithMyLittleEye(foreignVue, govIndex) {
        let govProp = "gov" + govIndex;
        if (!settings[`foreignSpy${govIndex}`]) { return; } // Setting not enabled
        if (game.global.civic.foreign[govProp].occ) { return; } // Government is occupied
        if (foreignVue.spy_disabled(govIndex)) { return; } // We can't train a spy as the button is disabled (cost or already training)

        // If we haven't reached the max number of spies allowed
        if (settings[`foreignSpyMax${govIndex}`] < 0 || (game.global.civic.foreign[govProp].spy < settings[`foreignSpyMax${govIndex}`])) {
            state.log.logSuccess(loggingTypes.spying, `Training a spy to send against ${getGovName(govIndex)}.`);
            foreignVue.spy(govIndex);
        }
    }

    /**
     * @param {number} govIndex
     */
    function performEspionageOperation(govIndex) {
        let govProp = "gov" + govIndex;
        if (game.global.tech['spy'] < 2) { return; } // Is espionage unlocked?
        if (game.global.civic.foreign[govProp].occ) { return; }

        if (settings[`foreignSpyOp${govIndex}`] !== espionageTypes.none.id && game.global.civic.foreign[govProp].spy > 0) {
            state.spyManager.performEspionage(govIndex, settings[`foreignSpyOp${govIndex}`]);
        }
    }

    //#region Auto Battle

    function autoBattle() {
        if (!settings.autoFight) { return; }

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

        // Now that we've hired mercenaries we can continue to check the rest of the autofight logic
        if (!state.warManager.isUnlocked()) { return; }

        // Don't send our troops out if we're preparing for MAD as we need all troops at home for maximum plasmids
        if (state.goal === "PreparingMAD") {
            state.warManager.hireMercenary(); // but hire mercenaries if we can afford it to get there quicker
            return;
        }

        let govOccupyIndex = -1;
        let govAttackIndex = -1;
        let govUnoccupyIndex = -1;

        // Check if there is an unoccupied foreign power that we can occupy
        if (settings.foreignOccupy2 && !game.global.civic.foreign[`gov2`].occ) {
            govOccupyIndex = 2;
        } else if (settings.foreignOccupy1 && !game.global.civic.foreign[`gov1`].occ) {
            govOccupyIndex = 1;
        } else if (settings.foreignOccupy0 && !game.global.civic.foreign[`gov0`].occ) {
            govOccupyIndex = 0;
        }
        
        // Find someone that we are allowed to attack. Only check non-occupied foreign powers
        if (settings.foreignAttack0 && !game.global.civic.foreign[`gov0`].occ) {
            govAttackIndex = 0;
        } else if (settings.foreignAttack1 && !game.global.civic.foreign[`gov1`].occ) {
            govAttackIndex = 1;
        } else if (settings.foreignAttack2 && !game.global.civic.foreign[`gov2`].occ) {
            govAttackIndex = 2;
        }

        // Check if there is an already occupied foreign power that we can unoccupy, then attack to occupy again
        if (settings.foreignOccupy0 && settings.foreignAttack0 && game.global.civic.foreign[`gov0`].occ) {
            govUnoccupyIndex = 0;
        } else if (settings.foreignOccupy1 && settings.foreignAttack1 && game.global.civic.foreign[`gov1`].occ) {
            govUnoccupyIndex = 1;
        } else if (settings.foreignOccupy2 && settings.foreignAttack2 && game.global.civic.foreign[`gov2`].occ) {
            govUnoccupyIndex = 2;
        }

        // If there is no one to attack or occupy or we are not fully ready then return
        if (govOccupyIndex === -1 && govAttackIndex === -1 && govUnoccupyIndex === -1) { return; }
        if (state.warManager.maxCityGarrison <= 0
            || state.warManager.woundedSoldiers > (1 - settings.foreignAttackHealthySoldiersPercent / 100) * state.warManager.maxCityGarrison
            || state.warManager.currentCityGarrison < settings.foreignAttackLivingSoldiersPercent / 100 * state.warManager.maxCityGarrison) {
                return;
           }

        // We've got the soldiers, they're not wounded and they're ready to go, so charge!
        // switchToBestAttackType returns true when the best attack type is set
        // If we are allowed to occupy a foreign power then we can perform attacks up to seige; otherwise we can only go up to assault so that we don't occupy them
        if (!state.warManager.switchToBestAttackType(govOccupyIndex, govAttackIndex, govUnoccupyIndex)) { return; }
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
            } else if (govAttackIndex >= 0) {
                state.log.logSuccess(loggingTypes.attack, `Launching ${state.warManager.campaignList[game.global.civic.garrison.tactic].name} campaign against ${getGovName(govAttackIndex)}.`)
            } else {
                state.log.logSuccess(loggingTypes.attack, `Unoccupying ${getGovName(govUnoccupyIndex)}.`)
            }
		    
            state.warManager.launchCampaign(state.warManager.selectedGovAttackIndex);
			
			if (state.warManager.woundedSoldiers > (1 - settings.foreignAttackHealthySoldiersPercent / 100) * state.warManager.maxCityGarrison
			     || state.warManager.currentCityGarrison < settings.foreignAttackLivingSoldiersPercent / 100 * state.warManager.maxCityGarrison) {
			    	 return;
			}
		}
    }

    //#endregion Auto Battle
    
    //#region Auto Jobs

    function autoJobs() {
        state.jobManager.calculateCraftingMaxs();
        let jobList = state.jobManager.managedPriorityList();

        // No jobs unlocked yet
        if (jobList.length === 0) {
            return;
        }

        let quarryWorkerIndex = jobList.indexOf(state.jobs.QuarryWorker);
        let lumberjackIndex = -1;
        let scavengerIndex = jobList.indexOf(state.jobs.Scavenger);
        
        if (isEvilRace() && !isEvilUniverse()) {
            lumberjackIndex = jobList.indexOf(state.jobs.Farmer);
        } else {
            lumberjackIndex = jobList.indexOf(state.jobs.Lumberjack);
        }

        let breakpoint0Max = 0;
        let breakpoint1Max = 0;

        // Cath / Balorg / Imp race doesn't have farmers, unemployed are their farmers
        if (isHunterRace()) {
            for (let i = 0; i < jobList.length; i++) {
                const job = jobList[i];
                breakpoint0Max += job.breakpointEmployees(0, false);
                breakpoint1Max += job.breakpointEmployees(1, false);
            }

            log("autoJobs", "Max breakpoint 0: " + breakpoint0Max)
            log("autoJobs", "Max breakpoint 1: " + breakpoint1Max)
        }

        let availableEmployees = state.jobManager.totalEmployees;
        let requiredJobs = [];
        let jobAdjustments = [];

        log("autoJobs", "Total employees: " + availableEmployees);

        // First figure out how many farmers are required
        if (state.jobs.Farmer.isManaged()) {
            if (!state.jobs.Lumberjack.isUnlocked() && !state.jobs.QuarryWorker.isUnlocked()) {
                // No other jobs are unlocked - everyone on farming!
                requiredJobs.push(availableEmployees);
                log("autoJobs", "Pushing all farmers")
            } else if (resources.Population.currentQuantity > state.lastPopulationCount) {
                let populationChange = resources.Population.currentQuantity - state.lastPopulationCount;
                let farmerChange = state.jobs.Farmer.count - state.lastFarmerCount;

                if (populationChange === farmerChange && resources.Food.rateOfChange > 0) {
                    requiredJobs.push(Math.max(state.jobs.Farmer.count - populationChange, 0));
                    log("autoJobs", "Removing a farmer due to population growth")
                } else {
                    requiredJobs.push(state.jobs.Farmer.count);
                }
            } else if (resources.Food.storageRatio < 0.2 && resources.Food.rateOfChange < 0) {
                // We want food to fluctuate between 0.2 and 0.8 only. We only want to add one per loop until positive
                requiredJobs.push(Math.min(state.jobs.Farmer.count + 1, availableEmployees));
                log("autoJobs", "Adding one farmer")
            } else if (resources.Food.storageRatio > 0.8 && resources.Food.rateOfChange > 0) {
                // We want food to fluctuate between 0.2 and 0.8 only. We only want to remove one per loop until negative
                requiredJobs.push(Math.max(state.jobs.Farmer.count - 1, 0));
                log("autoJobs", "Removing one farmer")
            } else if (isHunterRace() && resources.Food.storageRatio > 0.3 && resources.Food.rateOfChange > resources.Population.currentQuantity / 10) {
                // Carnivore race. Put We've got some food so put them to work!
                requiredJobs.push(Math.max(state.jobs.Farmer.count - 1, 0));
                log("autoJobs", "Removing one farmer - Carnivore")
            } else {
                // We're good; leave farmers as they are
                requiredJobs.push(state.jobs.Farmer.count);
                log("autoJobs", "Leaving current farmers")
            }

            log("autoJobs", "currentQuantity " + resources.Population.currentQuantity + " breakpoint1Max " + breakpoint1Max + " requiredJobs[0] " + requiredJobs[0] + " breakpointEmployees(1) " + state.jobs.Lumberjack.breakpointEmployees(1, false) +  " breakpointEmployees(0) " + state.jobs.Lumberjack.breakpointEmployees(0, false))
            if (isEvilRace() && !isEvilUniverse()) {
                if (resources.Population.currentQuantity > breakpoint0Max && requiredJobs[0] < state.jobs.Lumberjack.breakpointEmployees(1, false)) {
                    log("autoJobs", "Setting required hunters to breakpoint 1")
                    requiredJobs[0] = state.jobs.Lumberjack.breakpointEmployees(1, false);
                } else if (requiredJobs[0] < state.jobs.Lumberjack.breakpointEmployees(0, false)) {
                    log("autoJobs", "Setting required hunters to breakpoint 0")
                    requiredJobs[0] = state.jobs.Lumberjack.breakpointEmployees(0, false);
                }
            }

            if (requiredJobs[0] < 0) { requiredJobs[0] = 0; }

            jobAdjustments.push(requiredJobs[0] - state.jobs.Farmer.count);
            availableEmployees -= requiredJobs[0];
        }

        let availableCraftsmen = state.jobManager.maxCraftsmen;

        for (let i = 0; i < state.jobManager.maxJobBreakpoints; i++) {
            for (let j = 0; j < jobList.length; j++) {
                const job = jobList[j];

                // We've already done the farmer above
                if (job === state.jobs.Farmer) {
                    continue;
                }

                if (i !== 0) {
                    // If we're going up to the next breakpoint then add back the workers from this job from the last one
                    // so that we don't double-take them
                    availableEmployees += requiredJobs[j];

                    // We have to keep track of craftsmen separately as they have a special max number of total craftsmen
                    if (job.isCraftsman()) {
                        availableCraftsmen += requiredJobs[j];
                    }
                }

                log("autoJobs", "job " + job._originalId + " job.breakpointEmployees(i) " + job.breakpointEmployees(i, false) + " availableEmployees " + availableEmployees);
                let jobsToAssign = 0;
                if (!job.isCraftsman()) {
                    jobsToAssign = Math.min(availableEmployees, job.breakpointEmployees(i, false));
                } else {
                    // We have to keep track of craftsmen separately as they have a special max number of total craftsmen
                    jobsToAssign = Math.min(availableEmployees, availableCraftsmen, job.breakpointEmployees(i, false));
                }

                // Don't assign bankers if our money is maxed and bankers aren't contributing to our money storage cap
                if (job === state.jobs.Banker && !isResearchUnlocked("swiss_banking") && resources.Money.storageRatio > 0.98) {
                    jobsToAssign = 0;
                }

                // Races with the Intelligent trait get bonus production based on the number of professors and scientists
                // Only unassign them when knowledge is max if the race is not intelligent
                // Once we've research shotgun sequencing we get boost and soon autoassemble genes so stop unassigning
                if (!isIntelligentRace() && !isResearchUnlocked("shotgun_sequencing")) {
                    // Don't assign professors if our knowledge is maxed and professors aren't contributing to our temple bonus
                    if (job === state.jobs.Professor && !isResearchUnlocked("indoctrination") && resources.Knowledge.storageRatio > 0.98) {
                        jobsToAssign = 0;
                    }

                    // Don't assign scientists if our knowledge is maxed and scientists aren't contributing to our knowledge cap
                    if (job === state.jobs.Scientist && !isResearchUnlocked("scientific_journal") && resources.Knowledge.storageRatio > 0.98) {
                        jobsToAssign = 0;
                    }
                }

                if (job === state.jobs.CementWorker) {
                    let currentCementWorkers = job.count;
                    log("autoJobs", "jobsToAssign: " + jobsToAssign + ", currentCementWorkers" + currentCementWorkers + ", resources.stone.rateOfChange " + resources.Stone.rateOfChange);

                    if (jobsToAssign < currentCementWorkers) {
                        // great, remove workers as we want less than we have
                    } else if (jobsToAssign >= currentCementWorkers && resources.Stone.rateOfChange < 5) {
                        // If we're making less than 5 stone then lets remove a cement worker even if we want more
                        jobsToAssign = job.count - 1;
                    } else if (jobsToAssign > job.count && resources.Stone.rateOfChange > 8) {
                        // If we want more cement workers and we're making more than 8 stone then add a cement worker
                        jobsToAssign = job.count + 1;
                    } else {
                        // We're not making enough stone to add a new cement worker so leave it
                        jobsToAssign = job.count;
                    }
                }

                if (i === 0) {
                    requiredJobs.push(jobsToAssign);
                    jobAdjustments.push(jobsToAssign - job.count);
                } else {
                    requiredJobs[j] = jobsToAssign;
                    jobAdjustments[j] = jobsToAssign - job.count;
                }
                
                availableEmployees -= jobsToAssign;

                // We have to keep track of craftsmen separately as they have a special max number of total craftsmen
                if (job.isCraftsman()) {
                    availableCraftsmen -= jobsToAssign;
                }

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
            while (availableEmployees >= 1 && findArrayIndex(splitJobs, "completed", false) != -1) {
                splitJobs.forEach(jobDetails => {
                    if (availableEmployees <= 0 || requiredJobs[jobDetails.jobIndex] >= jobDetails.job.breakpointEmployees(0, true)) {
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
            while (availableEmployees >= 1 && findArrayIndex(splitJobs, "completed", false) != -1) {
                splitJobs.forEach(jobDetails => {
                    if (availableEmployees <= 0 || requiredJobs[jobDetails.jobIndex] >= jobDetails.job.breakpointEmployees(1, true)) {
                        jobDetails.completed = true;
                        return;
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
                        return;
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
        }

        if (settings.autoCraftsmen && state.jobs.SheetMetal.isManaged() && settings['craft' + state.jobs.SheetMetal.resource.id]) {
            if (state.cityBuildings.Wardenclyffe.count < 18) {
                let sheetMetalIndex = jobList.indexOf(state.jobs.SheetMetal);

                if (sheetMetalIndex != -1 && state.cityBuildings.Cottage.count > 10 && state.cityBuildings.Library.count > 15 && state.cityBuildings.CoalMine.count > 8) {
                    let plywoodIndex = jobList.indexOf(state.jobs.Plywood);
                    let brickIndex = jobList.indexOf(state.jobs.Brick);
                    let wroughtIronIndex = jobList.indexOf(state.jobs.WroughtIron);
                    let additionalSheetMetalJobs = 0;
                    
                    if (plywoodIndex !== -1 && state.jobs.Plywood.isManaged()) {
                        // add plywood jobs above 1 to sheet metal
                        let plywoodJobs = requiredJobs[plywoodIndex];

                        if (plywoodJobs > 1) {
                            requiredJobs[plywoodIndex] = 1;
                            jobAdjustments[plywoodIndex] -= (plywoodJobs - 1);
                            additionalSheetMetalJobs += (plywoodJobs - 1);
                        }
                    }

                    if (brickIndex !== -1 && state.jobs.Brick.isManaged()) {
                        // add brick jobs above 1 to sheet metal
                        let brickJobs = requiredJobs[brickIndex];

                        if (brickJobs > 1) {
                            requiredJobs[brickIndex] = 1;
                            jobAdjustments[brickIndex] -= (brickJobs - 1);
                            additionalSheetMetalJobs += (brickJobs - 1);
                        }
                    }

                    if (wroughtIronIndex !== -1 && state.jobs.WroughtIron.isManaged()) {
                        // add wroughtIron jobs above 1 to sheet metal
                        let wroughtIronJobs = requiredJobs[wroughtIronIndex];

                        if (wroughtIronJobs > 1) {
                            requiredJobs[wroughtIronIndex] = 1;
                            jobAdjustments[wroughtIronIndex] -= (wroughtIronJobs - 1);
                            additionalSheetMetalJobs += (wroughtIronJobs - 1);
                        }
                    }

                    requiredJobs[sheetMetalIndex] += additionalSheetMetalJobs;
                    jobAdjustments[sheetMetalIndex] += additionalSheetMetalJobs;
                }
            }
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

        let maxMorale = 100 + state.cityBuildings.Amphitheatre.count + state.cityBuildings.Casino.count
            + (state.spaceBuildings.RedVrCenter.stateOnCount * 2) + (state.projects.Monument.level * 2);
        if (game.global.tech[techSuperstar]) {
            maxMorale += state.jobs.Entertainer.count;
        }

        if (currentTaxRate < 20) {
            maxMorale += 10 - Math.floor(currentTaxRate / 2);
        }

        maxMorale = Math.min(maxMorale, settings.generalMaximumMorale);

        // Max tax rate calculation
        let extreme = game.global.tech['currency'] && game.global.tech['currency'] >= 5 ? true : false;
        let maxTaxRate = game.global.civic.govern.type === 'oligarchy' ? 40 : 30;
        if (extreme || game.global.race['terrifying']) {
            maxTaxRate += 20;
        }

        // Min tax rate calculation
        let minTaxRate = 10;

        if (extreme || game.global.race['terrifying']) {
            minTaxRate = 0;
        }

        // Noble race adjustments to min and max tax rate calculations - can only set tax between 10 and 20 inclusive
        if (game.global.race['noble']) {
            if (maxTaxRate > 20) {
                maxTaxRate = 20;
            }
            if (minTaxRate < 10) {
                minTaxRate = 10;
            }
        }

        if (currentTaxRate < maxTaxRate &&
                ((currentTaxRate < settings.generalMinimumTaxRate && resources.Money.storageRatio < 0.98)
                || (currentMorale > settings.generalMinimumMorale && currentMorale >= maxMorale)
                || (currentMorale <= settings.generalMinimumMorale && currentTaxRate < 26))) {
            taxVue.add();
        }

        if (currentTaxRate > minTaxRate
                && (currentTaxRate > settings.generalMinimumTaxRate || resources.Money.storageRatio >= 0.98)
                && (currentMorale < maxMorale - 1 || (currentMorale < settings.generalMinimumMorale && currentTaxRate > 26))) {
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

                let remainingRateOfChange = fuel.productionCost.resource.rateOfChange + (smelter.fueledCount(fuel.fuelIndex) * fuel.productionCost.quantity);

                while (remainingSmelters > 0 && remainingRateOfChange - fuel.productionCost.quantity > fuel.productionCost.minRateOfChange) {
                    fuel.required++;
                    remainingRateOfChange -= fuel.productionCost.quantity;
                    remainingSmelters --;
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
        
        // Adjust steel production
        let steelAdjustment = 0;

        if (state.lastSmelterCheckLoop === 0 || (state.lastSmelterCheckLoop + 30 <= state.loopCounter)) {
            // We've already got our cached values so just check if there is any need to change our ratios
            steelAdjustment = determineSteelAdjustment();
            state.lastSmelterCheckLoop = state.loopCounter;
        } else {
            let steelSmeltingConsumption = smelter.smeltingConsumption[SmelterSmeltingTypes.Steel];
            for (let i = 0; i < steelSmeltingConsumption.length; i++) {
                let productionCost = steelSmeltingConsumption[i];
                
                if (productionCost.resource.rateOfChange < productionCost.minRateOfChange
                        && productionCost.resource.storageRatio < 0.5
                        && smelter.smeltingCount(SmelterSmeltingTypes.Steel) > 0) {
                    steelAdjustment = -2;
                    break;
                }
            }
        }

        if (steelAdjustment > 0) {
            state.cityBuildings.Smelter.increaseSmelting(SmelterSmeltingTypes.Steel, steelAdjustment);
        }

        if (steelAdjustment < 0) {
            state.cityBuildings.Smelter.increaseSmelting(SmelterSmeltingTypes.Iron, steelAdjustment * -1);
        }
    }

    function determineSteelAdjustment() {
        let smelterIronCount = state.cityBuildings.Smelter.smeltingCount(SmelterSmeltingTypes.Iron);
        let smelterSteelCount = state.cityBuildings.Smelter.smeltingCount(SmelterSmeltingTypes.Steel);

        // The number of buildings hasn't changed so check if we need to adjust. Otherwise continue to updating our numbers
        let maxAllowedSteel = state.cityBuildings.Smelter.maxOperating;
        let currentAvaiableRateOfChange = [];
        let steelSmeltingConsumption = state.cityBuildings.Smelter.smeltingConsumption[SmelterSmeltingTypes.Steel];

        // We only care about steel. It isn't worth doing a full generic calculation here
        // Just assume that smelters will always be fueled so Iron smelting is unlimited
        // We want to work out the maximum steel smelters that we can have based on our resource consumption
        for (let i = 0; i < steelSmeltingConsumption.length; i++) {
            let productionCost = steelSmeltingConsumption[i];
            currentAvaiableRateOfChange.push(productionCost.resource.rateOfChange);
        }

        for (let i = 0; i < steelSmeltingConsumption.length; i++) {
            let productionCost = steelSmeltingConsumption[i];
            currentAvaiableRateOfChange[i] += productionCost.quantity * smelterSteelCount;
            let maxAllowedForProductionCost = Math.floor((currentAvaiableRateOfChange[i] - productionCost.minRateOfChange) / productionCost.quantity);
            maxAllowedSteel = Math.min(maxAllowedSteel, maxAllowedForProductionCost);

            if (maxAllowedForProductionCost < maxAllowedSteel) {
                maxAllowedSteel = maxAllowedForProductionCost;
            }
        }

        if (maxAllowedSteel < 0) { maxAllowedSteel = 0; }

        // Now figure out how many steel smelters we want regardless of resource consumption
        let desiredSteelCount = state.cityBuildings.Smelter.maxOperating;

        if (state.cityBuildings.Cottage.count < 15) {
            // half to steel with any remainder going to steel
            desiredSteelCount = Math.ceil(state.cityBuildings.Smelter.maxOperating / 2);
        } else if (state.cityBuildings.CoalMine.count < 10) {
            // two thirds to steel with any remainder going to steel
            desiredSteelCount = Math.ceil(state.cityBuildings.Smelter.maxOperating * 2 / 3);
        } else if (resources.Iron.rateOfChange > 100 || resources.Iron.storageRatio > 0.99) {
            desiredSteelCount = state.cityBuildings.Smelter.maxOperating;
        } else if (smelterIronCount >= 2) {
            desiredSteelCount = state.cityBuildings.Smelter.maxOperating - 2;
        }

        // We'll take the minium of our desired and maximum allowed steel
        if (desiredSteelCount > maxAllowedSteel) { desiredSteelCount = maxAllowedSteel; }
        let adjustmentToSteelCount = desiredSteelCount - smelterSteelCount;

        return adjustmentToSteelCount;
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

        while (remainingFactories > 0 && findArrayIndex(allProduction, "completed", false) != -1) {
            let maxOperatingFactories = remainingFactories;
            let totalWeight = allProduction.reduce((sum, production) => sum + (production.completed ? 0 : production.weighting), 0);

            for (let i = 0; i < allProduction.length; i++) {
                const production = allProduction[i];
                
                if (production.completed) {
                    continue;
                }

                let calculatedRequiredFactories = Math.min(remainingFactories, Math.ceil(maxOperatingFactories / totalWeight * production.weighting));
                let actualRequiredFactories = calculatedRequiredFactories;
                let productionCosts = state.cityBuildings.Factory.productionCosts(production.goods);

                productionCosts.forEach(resourceCost => {
                    let previousCost = state.cityBuildings.Factory.currentProduction(production.goods) * resourceCost.quantity;
                    let cost = actualRequiredFactories * resourceCost.quantity;
                    let rate = resourceCost.resource.rateOfChange + resourceCost.minRateOfChange + previousCost;

                    if (production.resource.storageRatio > 0.99) {
                        actualRequiredFactories = 0;
                    } else {
                        // If we can't afford it (it's above our minimum rate of change) then remove a factory
                        // UNLESS we've got over 80% storage full. In that case lets go wild!
                        while (cost > 0 && cost > rate && resourceCost.resource.storageRatio < 0.8) {
                            cost -= resourceCost.quantity;
                            actualRequiredFactories -= 1;
                        }
                    }
                });

                remainingFactories -= actualRequiredFactories;
                production.requiredFactories += actualRequiredFactories;

                if (calculatedRequiredFactories !== actualRequiredFactories) {
                    production.completed = true;
                }
            }
        }

        // If we have any remaining factories and the user wants to allocate unallocated factories to money then do it
        let luxuryGoodsIndex = findArrayIndex(allProduction, "goods", FactoryGoods.LuxuryGoods);
        if (remainingFactories > 0 && allProduction[luxuryGoodsIndex].requiredFactories === 0 && settings.productionMoneyIfOnly) {
            let actualRequiredFactories = remainingFactories;
            let productionCosts = state.cityBuildings.Factory.productionCosts(FactoryGoods.LuxuryGoods);

            productionCosts.forEach(resourceCost => {
                let previousCost = state.cityBuildings.Factory.currentProduction(FactoryGoods.LuxuryGoods) * resourceCost.quantity;
                let cost = actualRequiredFactories * resourceCost.quantity;
                let rate = resourceCost.resource.rateOfChange + resourceCost.minRateOfChange + previousCost;

                if (allProduction[luxuryGoodsIndex].resource.storageRatio > 0.99) {
                    actualRequiredFactories = 0;
                } else {
                    // If we can't afford it (it's above our minimum rate of change) then remove a factory
                    // UNLESS we've got over 80% storage full. In that case lets go wild!
                    while (cost > 0 && cost > rate && resourceCost.resource.storageRatio < 0.8) {
                        cost -= resourceCost.quantity;
                        actualRequiredFactories -= 1;
                    }
                }

                allProduction[luxuryGoodsIndex].requiredFactories += actualRequiredFactories;
            });
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

        for (let i = 0; i < plant.grapheheConsumption.length; i++) {
            const consumption = plant.grapheheConsumption[i];

            if (remainingPlants === 0) {
                return;
            }

            let currentFuelCount = plant.fueledCount(i);
            let rateOfChange = consumption.resource.rateOfChange;
            rateOfChange += (consumption.quantity * currentFuelCount);
            let maxFueledForConsumption = Math.floor((rateOfChange - consumption.minRateOfChange) / consumption.quantity);
    
            if (maxFueledForConsumption > remainingPlants) {
                maxFueledForConsumption = remainingPlants;
            }
            
            if (maxFueledForConsumption != currentFuelCount) {
                let delta = maxFueledForConsumption - currentFuelCount;
                plant.increaseFuel(i, delta);
            }
    
            remainingPlants -= plant.fueledCount(i);
        }
    }

    //#endregion Auto Graphene Plant
    
    //#region Mass Ejector

    /** @type { { resource: Resource, requirement: number }[] } */
    var resourcesByAtomicMass = null;

    function autoMassEjector() {
        if (!settings.prestigeWhiteholeEjectEnabled) { return; }
        if (state.spaceBuildings.BlackholeMassEjector.stateOnCount === 0) { return; }

        // Now that we have a mass ejector then set up our sorted resource atomic mass array
        if (resourcesByAtomicMass === null) {
            resourcesByAtomicMass = [];

            Object.keys(resources).forEach(resourceKey => {
                let resource = resources[resourceKey];
                if (resource === resources.Elerium || resource === resource.Infernite) { return; } // We'll add these exotic resources to the front of the list after sorting as these should always come first

                if (resource.isEjectable()) {
                    resourcesByAtomicMass.push({ resource: resource, requirement: 0, });
                }
            });

            resourcesByAtomicMass.sort((a, b) => b.resource.atomicMass - a.resource.atomicMass );

            // Elerium and infernite are always first as they are the exotic resources which are worth the most DE
            resourcesByAtomicMass.unshift({ resource: resources.Infernite, requirement: 0, });
            resourcesByAtomicMass.unshift({ resource: resources.Elerium, requirement: 0, });
        }

        let adjustMassEjector = false;

        // Eject everything!
        if (state.spaceBuildings.BlackholeMassEjector.stateOnCount >= settings.prestigeWhiteholeEjectAllCount) {
            let remaining = state.spaceBuildings.BlackholeMassEjector.stateOnCount * 1000;
            adjustMassEjector = true;

            resourcesByAtomicMass.forEach(resourceRequirement => {
                let resource = resourceRequirement.resource;
                let roundedRateOfChange = Math.floor(resource.rateOfChange);

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
                let roundedRateOfChange = Math.floor(resource.rateOfChange);

                if (remaining <= 0 || resource.storageRatio < 0.99) {
                    resourceRequirement.requirement = 0;
                    return;
                }

                if (resource.storageRatio > 0.01 && roundedRateOfChange === 0) {
                    resourceRequirement.requirement = game.global.interstellar.mass_ejector[resource.id];
                } else if (resource.storageRatio > 0.01 && roundedRateOfChange < 0) {
                    resourceRequirement.requirement = Math.max(0, game.global.interstellar.mass_ejector[resource.id] + roundedRateOfChange);
                } else if (resource.storageRatio > 0.01 && roundedRateOfChange > 0) {
                    resourceRequirement.requirement = Math.min(remaining, game.global.interstellar.mass_ejector[resource.id] + roundedRateOfChange);
                } else {
                    resourceRequirement.requirement = 0;
                }

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
        if (!settings.prestigeWhiteholeReset) { return; }
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
        if (game.global.interstellar.stellar_engine.mass === undefined || game.global.interstellar.stellar_engine.exotic === undefined) { return 0; }
        return +(game.global.interstellar.stellar_engine.mass + game.global.interstellar.stellar_engine.exotic).toFixed(10);
    }

    //#endregion Auto Whitehole

    //#region Auto MAD

    function autoMadPrestige() {
        if (!settings.autoMAD) { return; }

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
        
        if (state.warManager.currentSoldiers === state.warManager.maxSoldiers) {
            // Push... the button
            console.log("Soft resetting game with MAD");
            state.goal = "GameOverMan";
            logClick(launchMissilesBtn, "launch missiles");
        }
    }

    //#endregion Auto MAD

    //#region Auto Seeder Ship

    function autoSeederPrestige() {
        let spaceDock = state.spaceBuildings.GasSpaceDock;

        if (!settings.autoSeeder) { return; }
        if (!spaceDock.isUnlocked()) { return; }
        if (spaceDock.count < 1) { return; }
        if (!isBioseederPrestigeAvailable()) { return; } // ship completed and probe requirements met

        if (state.goal === "Standard") {
            if (state.spaceBuildings.GasSpaceDockPrepForLaunch.isUnlocked()) {
                state.spaceBuildings.GasSpaceDockPrepForLaunch.click(1);
                state.goal = "ReadyLaunch";
                return;
            } else {
                // Open the modal to update the options
                state.spaceBuildings.GasSpaceDock.cacheOptions();
                return;
            }
        }

        if (state.goal === "ReadyLaunch") {
            if (state.spaceBuildings.GasSpaceDockLaunch.isUnlocked()) {
                console.log("Soft resetting game with BioSeeder ship");
                state.goal = "GameOverMan";
                state.spaceBuildings.GasSpaceDockLaunch.click(1);
            } else {
                // Open the modal to update the options
                state.spaceBuildings.GasSpaceDock.cacheOptions();
                return;
            }
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
        adjustTradeRoutes();

        let m = state.marketManager;

        // Market has not been unlocked in game yet (tech not researched)
        if (!m.isUnlocked()) {
            return;
        }
        
        let currentMultiplier = m.getMultiplier(); // Save the current multiplier so we can reset it at the end of the function
        let maxMultiplier = m.getMaxMultiplier();
        
        for (let i = 0; i < m.priorityList.length; i++) {
            let resource = m.priorityList[i];

            if (!resource.isTradable || !resource.isUnlocked() || !m.isBuySellUnlocked(resource)) {
                continue;
            }
            
            if ((resource.autoSellEnabled && (ignoreSellRatio || resource.storageRatio > resource.autoSellRatio)) || resource.storageRatio === 1) {
                let maxAllowedTotalSellPrice = resources.Money.maxQuantity - resources.Money.currentQuantity;
                let unitSellPrice = m.getUnitSellPrice(resource);
                let maxAllowedUnits = Math.floor(maxAllowedTotalSellPrice / unitSellPrice); // only sell up to our maximum money

                if (resource.storageRatio < 0.99) {
                    maxAllowedUnits = Math.min(maxAllowedUnits, Math.floor(resource.currentQuantity - (resource.autoSellRatio * resource.maxQuantity))); // If not full sell up to our sell ratio
                } else {
                    maxAllowedUnits = Math.min(maxAllowedUnits, Math.floor(resource.rateOfChange * 2)); // If resource is full then sell up to 2 seconds worth of production
                }

                if (maxAllowedUnits <= maxMultiplier) {
                    // Our current max multiplier covers the full amount that we want to sell
                    m.setMultiplier(maxAllowedUnits);
                    m.sell(resource)
                } else {
                    // Our current max multiplier doesn't cover the full amount that we want to sell. Sell up to 10 batches.
                    let counter = Math.min(5, Math.floor(maxAllowedUnits / maxMultiplier)); // Allow up to 10 sales per script loop
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
                m.setMultiplier(currentMultiplier);
                let tradeQuantity = m.getMultiplier();
                let buyValue = tradeQuantity * m.getUnitBuyPrice(resource);
                let counter = 0;

                while(true) {
                    // break if not enough money or not enough resource storage
                    if (resources.Money.currentQuantity - buyValue <= state.minimumMoneyAllowed || resource.currentQuantity + tradeQuantity > resource.maxQuantity - 3 * tradeQuantity || counter++ > 2) {
                        break;
                    }

                    m.buy(resource);
                }
            }
        }

        m.setMultiplier(currentMultiplier); // Reset multiplier
    }

    //#endregion Auto Market
    
    //#region Auto Building

    /**
     * @param {Action} building
     * @param {Resource} requiredResource
     * @param {number} requiredProduction
     */
    function buildIfEnoughProduction(building, requiredResource, requiredProduction) {
        if (building.autoBuildEnabled && building.count < building.autoMax && requiredResource.rateOfChange > requiredProduction) {
            return building.click(1);
        }

        return false;
    }
    
    function autoGatherResources() {
        // Don't spam click once we've got a bit of population going
        if (state.cityBuildings.RockQuarry.count > 0 && resources.Population.currentQuantity > 15) {
            return;
        }

        state.cityBuildings.Food.click(50);
        state.cityBuildings.Lumber.click(50);
        state.cityBuildings.Stone.click(50);
        state.cityBuildings.Slaughter.click(50);
    }
    
    function autoBuild() {
        autoGatherResources();

        // Space dock is special and has a modal window with more buildings!
        if (!state.spaceBuildings.GasSpaceDock.isOptionsCached()) {
            if (state.spaceBuildings.GasSpaceDock.cacheOptions()) {
                return;
            }
        }

        let buildingList = state.buildingManager.managedPriorityList();

        // No buildings unlocked yet
        if (buildingList.length === 0) {
            return;
        }

        // Loop through the auto build list and try to buy them
        for (let i = 0; i < buildingList.length; i++) {
            const building = buildingList[i];

            if (!building.autoBuildEnabled || state.triggerManager.buildingConflicts(building)) {
                continue;
            }

            // Only build the following buildings if we have enough production to cover what they use
            if (building === state.cityBuildings.Smelter && isLumberRace()) {
                if (buildIfEnoughProduction(building, resources.Lumber, 12)) {
                    return;
                }
            }

            if (building === state.cityBuildings.CoalPower) {
                // I'd like to check if we are in a "no plasmids" run but not sure how... so check manual crafting instead
                if (!isLowPlasmidCount()) {
                    if (buildIfEnoughProduction(building, resources.Coal, 2.35)) {
                        return;
                    }
                } else {
                    if (buildIfEnoughProduction(building, resources.Coal, 0.5)) { // If we don't have plasmids then have to go much lower
                        return;
                    }
                }
            }

            if (!settings.autoSpace && resources.Plasmid.currentQuantity > 2000 && building === state.cityBuildings.OilPower && state.jobManager.canManualCraft()) {
                if (building.clickIfCountLessThan(5)) {
                    return;
                }
            } else if (isLowPlasmidCount() && building === state.cityBuildings.OilPower) {
                if (buildIfEnoughProduction(building, resources.Oil, 1)) {
                    return;
                }
            } else if (building === state.cityBuildings.OilPower) {
                if (buildIfEnoughProduction(building, resources.Oil, 2.65)) {
                    return;
                }
            }

            if (building === state.cityBuildings.FissionPower) {
                if(buildIfEnoughProduction(building, resources.Uranium, 0.5)) {
                    return;
                }
            }

            // Don't build bioseeder if the user doesn't want it built
            if (building === state.spaceBuildings.GasSpaceDockShipSegment || building === state.spaceBuildings.GasSpaceDockProbe) {
                if (!settings.prestigeBioseedConstruct) {
                    continue;
                }
            }

            // Build building if less than our max
            if (building.count < building.autoMax) {
                if (building.click(1)) {
                    if (building._tab === "space" || building._tab === "interstellar" || building._tab === "portal") {
                        removePoppers();
                    }

                    return;
                }
            }
        }
    }

    //#endregion Auto Building

    //#region Auto Research

    function autoResearch() {
        let items = document.querySelectorAll('#tech .action');

        let targetResearch = "";
        for (let i = 0; i < state.triggerManager.targetTriggers.length; i++) {
            const trigger = state.triggerManager.targetTriggers[i];
            
            if (trigger.actionType === "research" && trigger.areRequirementsMet()) {
                for (let j = 0; j < items.length; j++) {
                    const itemId = items[j].id;
                    
                    if (tech[trigger.actionId].definition.id === itemId) {
                        targetResearch = itemId;
                    }
                }
            }
        }

        for (let i = 0; i < items.length; i++) {
            const itemId = items[i].id;
            let click = false;

            if (targetResearch !== "" && itemId !== targetResearch) {
                continue;
            }

            // Whitehole researches
            if (itemId === "tech-stabilize_blackhole" && settings.prestigeWhiteholeStabiliseMass && getBlackholeMass() < settings.prestigeWhiteholeMinMass) {
                // If user wants to stabilise blackhole when under minimum solar mass then do it
                click = true;
            } else if (itemId === "tech-exotic_infusion" || itemId === "tech-infusion_check" || itemId === "tech-infusion_confirm" || itemId === "tech-stabilize_blackhole") {
                // Don't click any of the whitehole reset options without user consent... that would be a dick move, man.
                continue;
            }

            if (itemId !== "tech-anthropology" && itemId !== "tech-fanaticism" && itemId !== "tech-wc_reject"
                && itemId !== "tech-wc_money" && itemId !== "tech-wc_morale" && itemId !== "tech-wc_conquest"
                && itemId !== "tech-study" && itemId !== "tech-deify") {
                    click = true;
            } else {
                if (itemId === settings.userResearchTheology_1) {
                    // use the user's override choice
                    log("autoResearch", "Picking user's choice of theology 1: " + itemId);
                    click = true;
                }

                if (settings.userResearchTheology_1 === "auto") {
                    if (!settings.autoSpace && itemId === "tech-anthropology") {
                        // If we're not going to space then research anthropology
                        log("autoResearch", "Picking: " + itemId);
                        click = true;
                    }
                    if (settings.autoSpace && itemId === "tech-fanaticism") {
                        // If we're going to space then research fanatacism
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

                if (itemId === settings.userResearchUnification) {
                    // use the user's override choice if it is "researchable"
                    if (isUnificationPossible(itemId)) {
                        log("autoResearch", "Picking user's choice of unification: " + itemId);
                        click = true;
                    }
                }

                if (settings.userResearchUnification === "auto") {
                    // Don't reject world unity. We want the +25% resource bonus
                    if (itemId === "tech-wc_money" || itemId === "tech-wc_morale"|| itemId === "tech-wc_conquest") {
                        if (isUnificationPossible(itemId)) {
                            log("autoResearch", "Picking: " + itemId);
                            click = true;
                        }
                    }
                }

                // Hey, we can get both theology researches
                if (itemId === "tech-anthropology" && isResearchUnlocked("fanaticism")) {
                    click = true;
                }
                if (itemId === "tech-fanaticism" && isResearchUnlocked("anthropology")) {
                    click = true;
                }
            }

            if (click && techIds[itemId].click()) {
                // The unification techs are special as they are always "clickable" even if they can't be afforded.
                // We don't want to continually remove the poppers if the script is clicking one every second that
                // it can't afford
                if (itemId !== "tech-wc_money" && itemId !== "tech-wc_morale" && itemId !== "tech-wc_conquest" && itemId !== "tech-wc_reject") {
                    removePoppers();
                }
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

                if (!requirement.resource.isCraftable && requirement.resource.storageRatio <= 0.98) {
                    log("autoARPA", "break: storage < 98%");
                    allowBuild = false;
                    break;
                }

                if (onePercentOfRequirementQuantity / requirement.resource.currentQuantity > (settings.arpaBuildIfStorageFullResourceMaxPercent / 100)) {
                    log("autoARPA", "break: storage ratio < setting");
                    allowBuild = false;
                    break;
                }

                if (requirement.resource.isCraftable && requirement.resource.currentQuantity - onePercentOfRequirementQuantity < settings.arpaBuildIfStorageFullCraftableMin) {
                    log("autoARPA", "break: craftables < setting");
                    allowBuild = false;
                    break;
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
        
        // Calculate the available power / resource rates of change that we have to work with
        let availablePower = parseFloat(availablePowerNode.textContent);
        let spaceFuelMultiplier = 0.95 ** state.cityBuildings.MassDriver.stateOnCount;

        for (let i = 0; i < buildingList.length; i++) {
            let building = buildingList[i];

            availablePower += (building.powered * building.stateOnCount);

            for (let j = 0; j < building.consumption.resourceTypes.length; j++) {
                let resourceType = building.consumption.resourceTypes[j];

                // Mass driver effect
                if (building._tab === "space" && (resourceType.resource === resources.Oil || resourceType.resource === resources.Helium_3)) {
                    resourceType.rate = resourceType.initialRate * spaceFuelMultiplier;
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

                if (building === state.spaceBuildings.BeltEleriumShip) {
                    if (resources.Elerium.storageRatio >= 0.99 && resources.Elerium.rateOfChange >= 0) {
                        if (state.spaceBuildings.DwarfEleriumReactor.autoStateEnabled) {
                            let required = (state.spaceBuildings.DwarfEleriumReactor.count + 1) * 2;
                            if (requiredStateOn >= required) {
                                continue;
                            }
                        }
                    }
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
                            isStorageAvailable = resourceType.resource.storageRatio > 0.1;
                        } else if (resourceType.resource === resources.Coal || resourceType.resource === resources.Oil
                                || resourceType.resource === resources.Uranium || resourceType.resource === resources.Helium_3
                                || resourceType.resource === resources.Elerium || resourceType.resource === resources.Deuterium) {
                            isStorageAvailable = resourceType.resource.storageRatio > 0.05;
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

    /**
     * @param {{ cratesToBuild: number; containersToBuild: number; availableCrates: number; availableContainers: number; adjustments: {resource: Resource, cratesAdjustment: number, containersAdjustment: number}[]; }} storageChanges
     * @param {Resource} resource
     * @param {number} requiredCrates
     * @param {number} requiredContainers
     */
    function addToStorageAdjustments(storageChanges, resource, requiredCrates, requiredContainers) {
        if (resource.currentCrates !== requiredCrates || resource.currentContainers !== requiredContainers) {
            let crates = Math.min(requiredCrates - resource.currentCrates, storageChanges.availableCrates);
            let containers = Math.min(requiredContainers - resource.currentContainers, storageChanges.availableContainers);

            if (crates !== 0 || containers !== 0) {
                storageChanges.adjustments.push({ resource: resource, cratesAdjustment: crates, containersAdjustment: containers });

                if (crates > 0) storageChanges.availableCrates -= crates;
                if (containers > 0) storageChanges.availableContainers -= containers;

                if (storageChanges.availableCrates < 0) storageChanges.availableCrates = 0;
                if (storageChanges.availableContainers < 0) storageChanges.availableContainers = 0;
            }

            return;
        }
    }

    function autoStorage() {
        let storageList = state.storageManager.managedPriorityList();

        if (storageList.length === 0) {
            return;
        }

        let numberOfCratesWeCanBuild = 1000000;
        let numberOfContainersWeCanBuild = 1000000;

        resources.Crates.resourceRequirements.forEach(requirement =>
            numberOfCratesWeCanBuild = Math.min(numberOfCratesWeCanBuild, requirement.resource.currentQuantity / requirement.quantity)
        );

        resources.Containers.resourceRequirements.forEach(requirement =>
            numberOfContainersWeCanBuild = Math.min(numberOfContainersWeCanBuild, requirement.resource.currentQuantity / requirement.quantity)
        );

        let storageChanges = {
            cratesToBuild: Math.min(resources.Crates.maxQuantity - resources.Crates.currentQuantity, numberOfCratesWeCanBuild),
            containersToBuild: Math.min(resources.Containers.maxQuantity - resources.Containers.currentQuantity, numberOfContainersWeCanBuild),
            availableCrates: resources.Crates.currentQuantity,
            availableContainers: resources.Containers.currentQuantity,

            /** @type { {resource: Resource, cratesAdjustment: number, containersAdjustment: number}[] } */
            adjustments: []
        };

        let totalCratesWeighting = 0;
        let totalContainersWeighting = 0;
        let totalCrates = resources.Crates.currentQuantity;
        let totalContainers = resources.Containers.currentQuantity;
        let autoStorageTotalMaxCrates = 0;
        let autoStorageTotalMaxContainers = 0;

        storageList.forEach(resource => {
            if (resource.autoCratesMax < 0 || resource.currentCrates < resource.autoCratesMax) {
                totalCratesWeighting += resource.autoStorageWeighting;
                totalCrates += resource.currentCrates;
                autoStorageTotalMaxCrates += resource.autoCratesMax;
            }

            if (resource.autoContainersMax < 0 || resource.currentContainers < resource.autoContainersMax) {
                totalContainersWeighting += resource.autoStorageWeighting;
                totalContainers += resource.currentContainers;
                autoStorageTotalMaxContainers += resource.autoContainersMax;
            }
        });

        if (settings.storageLimitPreMad && !isResearchUnlocked("mad")) {
            // Don't build any containers if we are pre-mad and we are limiting pre-mad storage
            storageChanges.containersToBuild = 0;

            autoStorageTotalMaxCrates = 0;

            if (isLowPlasmidCount()) {
                // If you don't have many plasmids then you need quite a few crates
                if (resources.Steel.isUnlocked()) {
                    addToStorageAdjustments(storageChanges, resources.Steel, 50, 0);
                    autoStorageTotalMaxCrates += 50;
                }
            } else {
                if (resources.Steel.isUnlocked()) {
                    addToStorageAdjustments(storageChanges, resources.Steel, 20, 0);
                    autoStorageTotalMaxCrates += 20;
                }
            }

            if (resources.Aluminium.isUnlocked()) {
                addToStorageAdjustments(storageChanges, resources.Aluminium, 20, 0);
                autoStorageTotalMaxCrates += 20;
            }
            if (resources.Titanium.isUnlocked()) {
                addToStorageAdjustments(storageChanges, resources.Titanium, 20, 0);
                autoStorageTotalMaxCrates += 20;
            }
            if (resources.Alloy.isUnlocked()) {
                addToStorageAdjustments(storageChanges, resources.Alloy, 20, 0);
                autoStorageTotalMaxCrates += 20;
            }
    
            // Polymer required for pre MAD tech is about 800. So just keep adding crates until we have that much storage space
            if (resources.Polymer.isUnlocked() && resources.Polymer.maxQuantity < 800) {
                addToStorageAdjustments(storageChanges, resources.Polymer, resources.Polymer.currentCrates + 1, 0);
                autoStorageTotalMaxCrates += resources.Polymer.currentCrates + 1;
            }

            // We've tinkered with the autoStorageTotalMaxCrates settings in this IF statement so we'll have to do this here
            if (totalCrates > autoStorageTotalMaxCrates) {
                storageChanges.cratesToBuild = 0;
            } else if (totalCrates + storageChanges.cratesToBuild >= autoStorageTotalMaxCrates) {
                storageChanges.cratesToBuild = Math.max(0, autoStorageTotalMaxCrates - totalCrates);
            }

            // Don't open the window every second... wait for a minute if all we're doing is building new crates / containers
            if (state.lastStorageBuildCheckLoop + 60 > state.loopCounter) {
                storageChanges.cratesToBuild = 0;
                storageChanges.containersToBuild = 0;
            }

        } else {
            // Assign crates and containers according to their weighting and accounting for their max settings

            // We'll also have the crates that we build
            if (totalCrates > autoStorageTotalMaxCrates) {
                storageChanges.cratesToBuild = 0;
            } else if (totalCrates + storageChanges.cratesToBuild >= autoStorageTotalMaxCrates) {
                storageChanges.cratesToBuild = Math.max(0, autoStorageTotalMaxCrates - totalCrates);
            }

            // We'll also have the containers that we build
            if (totalContainers > autoStorageTotalMaxContainers) {
                storageChanges.containersToBuild = 0;
            } else if (totalContainers + storageChanges.containersToBuild >= autoStorageTotalMaxContainers) {
                storageChanges.containersToBuild = Math.max(0, autoStorageTotalMaxContainers - totalContainers);
            }

            // Wait for a minute if all we're doing is building new crates / containers
            if (state.lastStorageBuildCheckLoop + 60 > state.loopCounter) {
                storageChanges.cratesToBuild = 0;
                storageChanges.containersToBuild = 0;
            }

            totalCrates += storageChanges.cratesToBuild;
            totalContainers += storageChanges.containersToBuild;

            storageList.forEach(resource => {
                let cratesStoragePercentage = resource.autoStorageWeighting / totalCratesWeighting;
                let containersStoragePercentage = resource.autoStorageWeighting / totalContainersWeighting;
                let requiredCrates = 0;
                let requiredContainers = 0;

                if (resource.currentCrates >= resource.autoCratesMax) {
                    requiredCrates = resource.autoCratesMax;
                } else {
                    requiredCrates = Math.ceil(totalCrates * cratesStoragePercentage);
                }

                // When we very first research MAD we don't want to suddenly reassign the storage that we added before.
                // Leave that as a minimum
                if (settings.storageLimitPreMad) {
                    if (resource === resources.Steel) { requiredCrates = Math.max(50, requiredCrates) }
                    if (resource === resources.Aluminium) { requiredCrates = Math.max(20, requiredCrates) }
                    if (resource === resources.Titanium) { requiredCrates = Math.max(20, requiredCrates) }
                    if (resource === resources.Alloy) { requiredCrates = Math.max(20, requiredCrates) }
                    if (resource === resources.Polymer) { requiredCrates = Math.max(5, requiredCrates) }
                }

                if (resource.currentContainers >= resource.autoContainersMax) {
                    requiredContainers = resource.autoContainersMax;
                } else {
                    requiredContainers = Math.ceil(totalContainers * containersStoragePercentage);
                }

                addToStorageAdjustments(storageChanges, resource, requiredCrates, requiredContainers);
            });
        }

        //console.log("To build crates " + storageChanges.cratesToBuild + ", containers " + storageChanges.containersToBuild);
        // for (let i = 0; i < storageChanges.adjustments.length; i++) {
        //     const adjustment = storageChanges.adjustments[i];
        //     console.log(adjustment.resource.id + " crates " + adjustment.cratesAdjustment + ", containers " + adjustment.containersAdjustment);
        // }

        if (storageChanges.cratesToBuild > 0 || storageChanges.containersToBuild > 0 || storageChanges.adjustments.length > 0) {
            if (storageChanges.cratesToBuild > 0 || storageChanges.containersToBuild > 0) {
                state.lastStorageBuildCheckLoop = state.loopCounter;
            }

            //console.log(storageChanges.adjustments.length + ", resource " + storageChanges.adjustments[0].resource.id + ", adjustment " + storageChanges.adjustments[0].cratesAdjustment)
            state.storageManager.tryConstructCrate(storageChanges.cratesToBuild);
            state.storageManager.tryConstructContainer(storageChanges.containersToBuild);

            storageChanges.adjustments.forEach(adjustment => {
                if (adjustment.cratesAdjustment > 0) {
                    adjustment.resource.tryAssignCrate(adjustment.cratesAdjustment);
                }
                if (adjustment.cratesAdjustment < 0) {
                    adjustment.resource.tryUnassignCrate(adjustment.cratesAdjustment * -1);
                }

                if (adjustment.containersAdjustment > 0) {
                    adjustment.resource.tryAssignContainer(adjustment.containersAdjustment);
                }
                if (adjustment.containersAdjustment < 0) {
                    adjustment.resource.tryUnassignContainer(adjustment.containersAdjustment * -1);
                }
            });
        }
    }

    /**
     * @param {any[] | { resource: any; requiredTradeRoutes: any; completed: boolean; index: number; }[]} requiredTradeRouteResources
     * @param {Resource[]} marketResources
     * @param {Resource} resource
     */
    function addResourceToTrade(requiredTradeRouteResources, marketResources, resource) {
        if (!resource.autoTradeBuyEnabled || resource.autoTradeBuyRoutes <= 0) {
            return;
        }

        requiredTradeRouteResources.push( {
            resource: resource,
            requiredTradeRoutes: resource.autoTradeBuyRoutes,
            completed: false,
            index: findArrayIndex(marketResources, "id", resource.id),
        } );
    }
    
    function adjustTradeRoutes() {
        let m = state.marketManager;
        let tradableResources = m.getSortedTradeRouteSellList();
        let maxTradeRoutes = m.getMaxTradeRoutes();
        let tradeRoutesUsed = 0;
        let currentMoneyPerSecond = resources.Money.rateOfChange;
        let requiredTradeRoutes = [];
        let adjustmentTradeRoutes = [];
        let resourcesToTrade = [];

        // Calculate the resources and money that we would have if we weren't trading anything on the market
        for (let i = 0; i < tradableResources.length; i++) {
            const resource = tradableResources[i];

            if (resource.currentTradeRoutes > 0) {
                currentMoneyPerSecond += resource.currentTradeRoutes * resource.currentTradeRouteBuyPrice;
            } else {
                currentMoneyPerSecond += resource.currentTradeRoutes * resource.currentTradeRouteSellPrice;
            }

            resource.calculatedRateOfChange -= resource.currentTradeRoutes * resource.tradeRouteQuantity;
        }

        // Fill our trade routes with selling
        for (let i = 0; i < tradableResources.length; i++) {
            const resource = tradableResources[i];
            requiredTradeRoutes.push(0);

            while (resource.autoTradeSellEnabled && tradeRoutesUsed < maxTradeRoutes && resource.storageRatio > 0.98 && resource.calculatedRateOfChange > resource.autoTradeSellMinPerSecond) {
                tradeRoutesUsed++;
                requiredTradeRoutes[i]--;
                resource.calculatedRateOfChange -= resource.tradeRouteQuantity;
                currentMoneyPerSecond += resource.currentTradeRouteSellPrice;
            }

            //console.log(resource.id + " tradeRoutesUsed " + tradeRoutesUsed + ", maxTradeRoutes " + maxTradeRoutes + ", storageRatio " + resource.storageRatio + ", calculatedRateOfChange " + resource.calculatedRateOfChange)
            if (resource.autoTradeBuyEnabled && resource.autoTradeBuyRoutes > 0) {
                addResourceToTrade(resourcesToTrade, tradableResources, resource);
            }
        }

        //console.log("current money per second: " + currentMoneyPerSecond);

        while (findArrayIndex(resourcesToTrade, "completed", false) != -1) {
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
                            && currentMoneyPerSecond - resourceToTrade.resource.currentTradeRouteBuyPrice > settings.tradeRouteMinimumMoneyPerSecond) {
                    currentMoneyPerSecond -= resourceToTrade.resource.currentTradeRouteBuyPrice;
                    tradeRoutesUsed++;
                    requiredTradeRoutes[resourceToTrade.index]++;
                    //console.log(state.loopCounter + " " + resourceToTrade.resource.id + " adding trade route - " + resourceToTrade.index)
                    continue;
                }

                // We're buying enough resources now or we don't have enough money to buy more anyway
                if (resourceToTrade.requiredTradeRoutes === requiredTradeRoutes[resourceToTrade.index]
                            || currentMoneyPerSecond - resourceToTrade.resource.currentTradeRouteBuyPrice < settings.tradeRouteMinimumMoneyPerSecond) {
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

                            if (currentMoneyPerSecond - reducedMoneyPerSecond - resourceToTrade.resource.currentTradeRouteBuyPrice > settings.tradeRouteMinimumMoneyPerSecond) {
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
        }
    }

    //#endregion Auto Trade Specials
    
    //#region Main Loop

    function updateState() {
        if (game.global.race.species === speciesProtoplasm) {
            state.goal = "Evolution";
        } else if (state.goal === "Evolution") {
            state.goal = "Standard";
            updateTriggerSettingsContent(); // We've moved from evolution to standard play. There are technology descriptions that we couldn't update until now.
        }
        
        if (settings.minimumMoneyPercentage > 0) {
            state.minimumMoneyAllowed = resources.Money.maxQuantity * settings.minimumMoneyPercentage / 100;
        } else {
            state.minimumMoneyAllowed = settings.minimumMoney;
        }
        
        // If our script opened a modal window but it is now closed (and the script didn't close it) then the user did so don't continue
        // with whatever our script was doing with the open modal window.
        if (state.windowManager.openedByScript && !state.windowManager.isOpenHtml()) {
            state.windowManager.resetWindowManager();
        }
        
        state.buildingManager.updateResourceRequirements();
        state.projectManager.updateResourceRequirements();
        
        if (resources.Population.cachedId !== resources.Population.id) {
            resources.Population.setupCache();
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
                'int_blackhole:mass_ejector','city:casino','prtl_fortress:repair_droid','gxy_stargate:defense_platform','prtl_pit:gun_emplacement','prtl_pit:soul_attractor','int_sirius:ascension_trigger'];

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
        // basic_housing is special. The key doesn't match the object in the game code
        // gift is a special santa gift. Leave it to the player.
        if (gameActionKey === "info" || gameActionKey === "basic_housing" || gameActionKey === "gift") {
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

    function automate() {
        // This is a hack to check that the entire page has actually loaded. The queueColumn is one of the last bits of the DOM
        // so if it is there then we are good to go. Otherwise, wait a little longer for the page to load.
        if (document.getElementById("queueColumn") === null) {
            return;
        }

        // Setup in the first loop only
        if (state.loopCounter === 1) {
            initialiseRaces();

            let tempTech = {};
            //@ts-ignore
            let technologies = Object.entries(game.actions.tech);
            for (const [technology, action] of technologies) {
                tempTech[technology] = new Technology(action);
                techIds[action.id] = tempTech[technology];
            }

            Object.keys(tempTech).sort().forEach(function(key) {
                tech[key] = tempTech[key];
            });

            resetBuildingState();

            updateStateFromSettings();
            updateSettingsFromState();

            state.triggerManager.priorityList.forEach(trigger => {
                trigger.complete = false;
            });

            // If debug logging is enabled then verify the game actions code is both correct and in sync with our script code
            if (showLogging) {
                verifyGameActions();
            }
        }

        state.triggerManager.updateCompleteTriggers();
        state.triggerManager.resetTargetTriggers();

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

        if (state.goal === "Evolution") {
            if (settings.autoEvolution) {
                autoEvolution();
            }
        } else if (state.goal !== "GameOverMan") {
            // Initial updates needed each loop
            for (let i = 0; i < state.allResourceList.length; i++) {
                state.allResourceList[i].calculatedRateOfChange = state.allResourceList[i].rateOfChange;
            }

            let massEjectorProcessed = false;
            if (state.spaceBuildings.BlackholeMassEjector.stateOnCount >= settings.prestigeWhiteholeEjectAllCount) {
                autoMassEjector(); // We do this at the start and end of the function. If eject all is required then this will occur at the start; otherwise process at the end
                massEjectorProcessed = true;
            }
            manageGovernment();
            autoBattle();

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
            if (settings.autoMarket) {
                autoMarket();
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
            if (settings.autoAssembleGene && !settings.genesAssembleGeneAlways) {
                autoAssembleGene();
            }

            autoWhiteholePrestige();
            autoSeederPrestige();
            autoMadPrestige();

            manageSpies();
            if (!massEjectorProcessed) {
                autoMassEjector(); // We do this at the start and end of the function. If eject all is required then this will occur at the start; otherwise process at the end
            }
        }
    }

    function mainAutoEvolveScript() {
        // @ts-ignore
        if (typeof unsafeWindow !== 'undefined') {
            // @ts-ignore
            game = unsafeWindow.game;
        } else {
            // @ts-ignore
            game = window.game;
        }

        setInterval(automate, 1000);
    }

    function shortLoop() {
        if (game === null) {
            return;
        }

        if (document.getElementById("queueColumn") === null) {
            return;
        }

        state.windowManager.checkCallbacks();

        if (settings.autoAssembleGene && settings.genesAssembleGeneAlways) {
            autoAssembleGene();
        }
    }

    setInterval(shortLoop, 50);

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
        `

        // Create style document
        var css = document.createElement('style');
        css.type = 'text/css';
        css.appendChild(document.createTextNode(styles));
        
        // Append style to html head
        document.getElementsByTagName("head")[0].appendChild(css);
    }

    const loadJQueryUI = (callback) => {
        const existingScript = document.getElementById('script_jqueryui');
      
        if (!existingScript) {
          const script = document.createElement('script');
          script.src = 'https://code.jquery.com/ui/1.12.1/jquery-ui.min.js'
          script.id = 'script_jqueryui'; // e.g., googleMaps or stripe
          document.body.appendChild(script);
      
          script.onload = () => {
            if (callback) callback();
          };
        }
      
        if (existingScript && callback) callback();
    };

    function createScriptSettings() {
        loadJQueryUI(() => {
            // Work to do after the library loads.
            buildScriptSettings();
          });
    }

    function buildScriptSettings() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let scriptContentNode = $('<div id="script_settings" style="margin-top: 30px;"></div>');
        $("#localization").parent().append(scriptContentNode);
        let parentNode = $('#script_settings');

        buildImportExport();
        buildPrestigeSettings(parentNode, true);
        buildGeneralSettings();
        buildGovernmentSettings(parentNode, true);
        buildEvolutionSettings();
        buildTriggerSettings();
        buildResearchSettings();
        buildWarSettings(parentNode, true);
        buildMarketSettings();
        buildStorageSettings();
        buildProductionSettings();
        buildJobSettings();
        buildBuildingSettings();
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
                    content.style.height = content.offsetHeight + "px";
                }

                updateSettingsFromState();
            });
        }

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildImportExport() {
        let importExportNode = $(".importExport");
        if (importExportNode === null) {
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
        updateTriggerSettingsContent();
        updateResearchSettingsContent();
        updateWarSettingsContent(true);
        updateMarketSettingsContent();
        updateStorageSettingsContent();
        updateProductionSettingsContent();
        updateJobSettingsContent();
        updateBuildingSettingsContent();
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
                '<div id="script_' + mainSectionId + 'Settings" style="margin-top: 2px;">' +
                    '<h3 id="' + mainSectionId + 'SettingsCollapsed" class="script-collapsible text-center has-text-success">' + sectionName + ' Settings</h3>' +
                '</div>'
            );

            contentContainerNode = $(
                '<div class="script-content">' +
                    '<div style="margin-top: 2px;"><button id="script_reset' + mainSectionId + '" class="button">Reset ' + sectionName + ' Settings</button></div>' +
                '</div>'
            );

            headerNode.append(contentContainerNode);
            parentNode.append(headerNode);

            $("#script_reset" + mainSectionId).on("click", function() { genericResetFunction(resetFunction, sectionName) });
        }

        let contentNode = $('<div style="margin-top: 2px; margin-bottom: 2px;" id="script_' + computedSectionId + 'Content"></div>');
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
            // Special processing for prestige options. If they are ready to prestige then warn the user about enabling them.
            let confirmationText = "";
            if (settingName === "autoMAD" && e.currentTarget.checked && isResearchUnlocked("mad")) {
                confirmationText = "MAD has already been researched. This may MAD immediately. Are you sure you want to enable MAD prestige?";
            } else if (settingName === "autoSeeder" && isBioseederPrestigeAvailable()) {
                confirmationText = "Bioseeder ship is ready to launch and may launch immediately. Are you sure you want to enable bioseeder prestige?";
            } else if (settingName === "" && isWhiteholePrestigeAvailable()) {
                confirmationText = "Whitehole exotic infusion is ready and may prestige immediately. Are you sure you want to enable whitehole prestige?";
            }

            if (confirmationText !== "") {
                if (!confirm(confirmationText)) {
                    e.currentTarget.checked = false;
                    return;
                }
            }

            settings[settingName] = e.currentTarget.checked;
            updateSettingsFromState();

            if (secondaryPrefix !== "") {
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

                if (secondaryPrefix !== "") {
                    let mainSetting = $('#' + mainSettingName);
                    mainSetting.val(settings[settingName]);
                }
            }
        });
    }

    function buildGeneralSettings() {
        let sectionId = "general";
        let sectionName = "General";

        let resetFunction = function() {
            //resetGeneralState();
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

        updateGeneralPreTable();

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function updateGeneralPreTable() {
        let currentNode = $('#script_generalContent');

        // Add the pre table section
        currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_generalPreTable"></div>');

        // Add any pre table settings
        let preTableNode = $('#script_generalPreTable');
        addStandardSectionSettingsToggle(preTableNode, "genesAssembleGeneAlways", "Always assemble genes", "Will continue assembling genes even after De Novo Sequencing is researched");
    }

    function buildPrestigeSettings(parentNode, isMainSettings) {
        let sectionId = "prestige";
        let sectionName = "Prestige";

        let resetFunction = function() {
            resetPrestigeSettings();
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

        // Foreign powers panel
        let prestigeHeaderNode = $(`<div id="script_${secondaryPrefix}prestige"></div>`);
        currentNode.append(prestigeHeaderNode);

        // MAD
        addStandardSectionHeader1(prestigeHeaderNode, "Mutual Assured Destruction");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "autoMAD", "Perform MAD prestige", "MAD prestige once MAD has been researched and all soldiers are home");

        // Bioseed
        addStandardSectionHeader1(prestigeHeaderNode, "Bioseed");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "autoSpace", "Construct Launch Facility", "Constructs the Launch Facility when it becomes available regardless of other settings");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeBioseedConstruct", "Constructs Bioseeder Ship Segments and Probes", "Construct the bioseeder ship segments and probes in preparation for bioseeding");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "autoSeeder", "Perform bioseeder ship prestige", "Launches the bioseeder ship to perform prestige when required probes have been constructed");
        addStandardSectionSettingsNumber2(secondaryPrefix, prestigeHeaderNode, 1, "prestigeBioseedProbes", "Required probes", "Required number of probes before launching bioseeder ship");

        // Whitehole
        addStandardSectionHeader1(prestigeHeaderNode, "Whitehole");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeWhiteholeReset", "Perform whitehole prestige", "Infuses the blackhole with exotic materials to perform prestige");
        addStandardSectionSettingsNumber2(secondaryPrefix, prestigeHeaderNode, 1, "prestigeWhiteholeMinMass", "Required minimum solar mass", "Required minimum solar mass of blackhole before prestiging");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 1, "prestigeWhiteholeStabiliseMass", "Stabilise blackhole until minimum solar mass reached", "Stabilises the blackhole with exotic materials until minimum solar mass is reached");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeWhiteholeEjectEnabled", "Enable mass ejector", "If not enabled the mass ejector will not be managed by the script");
        addStandardSectionSettingsNumber2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeWhiteholeEjectAllCount", "Eject everything once X mass ejectors constructed", "Once we've constructed X mass ejectors the eject as much of everything as possible");

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildGovernmentSettings(parentNode, isMainSettings) {
        let sectionId = "government";
        let sectionName = "Government";

        let resetFunction = function() {
            //resetGeneralState();
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

        // Add the pre table section
        currentNode.append(`<div id="script_${secondaryPrefix}governmentPreTable"></div>`);

        // Add any pre table settings
        let preTableNode = $(`#script_${secondaryPrefix}governmentPreTable`);
        addStandardSectionSettingsNumber2(secondaryPrefix, preTableNode, 0, "generalMinimumTaxRate", "Minimum allowed tax rate", "Minimum tax rate for autoTax. Will still go below this amount if money storage is full");
        addStandardSectionSettingsNumber2(secondaryPrefix, preTableNode, 0, "generalMinimumMorale", "Minimum allowed morale", "Use this to set a minimum allowed morale. Remember that less than 100% can cause riots and weather can cause sudden swings");
        addStandardSectionSettingsNumber2(secondaryPrefix, preTableNode, 0, "generalMaximumMorale", "Maximum allowed morale", "Use this to set a maximum allowed morale. The tax rate will be raised to lower morale to this maximum");

        addStandardSectionSettingsToggle2(secondaryPrefix, preTableNode, 0, "govManage", "Manage changes of government", "Manage changes of government when they become available");

        // Government selector
        buildGovernmentSelectorSetting(secondaryPrefix, preTableNode, "govInterim", "Interim Government", "Temporary low tier government until you research your final government choice");
        buildGovernmentSelectorSetting(secondaryPrefix, preTableNode, "govFinal", "Final Government", "Final government choice. Can be the same as the interim government");

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
            
            if (secondaryPrefix !== "") {
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

        // Target evolution
        let targetEvolutionNode = $('<div style="margin-top: 5px; width: 400px;"><label for="script_userEvolutionTargetName">Target Evolution:</label><select id="script_userEvolutionTargetName" style="width: 150px; float: right;"></select></div><div><span id="script_race_warning" class="has-text-danger"></span></div>');
        currentNode.append(targetEvolutionNode);

        let selectNode = $('#script_userEvolutionTargetName');

        let selected = settings.userEvolutionTargetName === "auto" ? ' selected="selected"' : "";
        let node = $('<option value = "auto"' + selected + '>Script Managed</option>');
        selectNode.append(node);

        for (let i = 0; i < raceAchievementList.length; i++) {
            const race = raceAchievementList[i];
            let selected = settings.userEvolutionTargetName === race.name ? ' selected="selected"' : "";

            let raceNode = $('<option value = "' + race.name + '"' + selected + '>' + race.name + '</option>');
            selectNode.append(raceNode);
        }

        let race = raceAchievementList[findArrayIndex(raceAchievementList, "name", settings.userEvolutionTargetName)];
        if (race !== null && race !== undefined && race.isEvolutionConditional) {
            document.getElementById("script_race_warning").textContent = "Warning! Only choose if you meet requirements: " + race.evolutionConditionText;
        }

        selectNode.on('change', function() {
            let value = $("#script_userEvolutionTargetName :selected").val();
            settings.userEvolutionTargetName = value;
            state.resetEvolutionTarget = true;
            updateSettingsFromState();
            //console.log("Chosen evolution target of " + value);
            
            let race = raceAchievementList[findArrayIndex(raceAchievementList, "name", settings.userEvolutionTargetName)];
            if (race !== null && race !== undefined && race.isEvolutionConditional) {
                document.getElementById("script_race_warning").textContent = "Warning! Only choose if you meet requirements: " + race.evolutionConditionText;
            } else {
                document.getElementById("script_race_warning").textContent = "";
            }

            let content = document.querySelector('#script_evolutionSettings .script-content');
            // @ts-ignore
            content.style.height = null;
            // @ts-ignore
            content.style.height = content.offsetHeight + "px"
        });

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
        addStandardSectionSettingsToggle(currentNode, "challenge_junker", "Junker", "Challenge mode - junker");

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
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
        updateTriggerPreTable();
        updateTriggerTable();

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function updateTriggerPreTable() {
        let currentNode = $('#script_triggerContent');

        // Add the pre table section
        currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_triggerPreTable"></div>');

        // Add any pre table settings
        let preTableNode = $('#script_triggerPreTable');
        let addButton = $('<div style="margin-top: 10px;"><button id="script_trigger_add" class="button">Add New Trigger</button></div>');
        preTableNode.append(addButton);
        $("#script_trigger_add").on("click", addTriggerSetting);
        //addStandardSectionSettingsNumber(preTableNode, "jobLumberWeighting", "Final Lumberjack Weighting", "AFTER allocating breakpoints this weighting will be used to split lumberjacks, quarry workers and scavengers");
    }

    function addTriggerSetting() {
        let trigger = state.triggerManager.AddTrigger("tech", "unlocked", "club", 0, "research", "club", 0);
        updateSettingsFromState();
        
        let tableBodyNode = $('#script_triggerTableBody');
        let newTableBodyText = "";

        let classAttribute = ' class="script-draggable"';
        newTableBodyText += '<tr value="' + trigger.seq + '"' + classAttribute + '><td id="script_trigger_' + trigger.seq + '" style="width:12.85%"></td><td style="width:12.85%"></td><td style="width:12.85%"></td><td style="width:12.85%"></td><td style="width:12.85%"></td><td style="width:12.85%"></td><td style="width:12.85%"></td><td style="width:10%"></td></tr>';

        tableBodyNode.append($(newTableBodyText));

        buildTriggerType(trigger);
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

    function updateTriggerTable() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_triggerContent');
        currentNode.append(
            `<table style="width:100%">
                    <tr><th class="has-text-warning" colspan="1">Trigger</th><th class="has-text-warning" colspan="3">Requirement</th><th class="has-text-warning" colspan="4">Action</th></tr>
                    <tr><th class="has-text-warning" style="width:12.85%">Type</th><th class="has-text-warning" style="width:12.85%">Type</th><th class="has-text-warning" style="width:12.85%">Id</th><th class="has-text-warning" style="width:12.85%">Count</th><th class="has-text-warning" style="width:12.85%">Type</th><th class="has-text-warning" style="width:12.85%">Id</th><th class="has-text-warning" style="width:12.85%">Count</th><th class="has-text-warning" style="width:10%"></th></tr>
                <tbody id="script_triggerTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_triggerTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < state.triggerManager.priorityList.length; i++) {
            const trigger = state.triggerManager.priorityList[i];
            let classAttribute = ' class="script-draggable"';
            newTableBodyText += '<tr value="' + trigger.seq + '"' + classAttribute + '><td id="script_trigger_' + trigger.seq + '" style="width:12.85%"></td><td style="width:12.85%"></td><td style="width:12.85%"></td><td style="width:12.85%"></td><td style="width:12.85%"></td><td style="width:12.85%"></td><td style="width:12.85%"></td><td style="width:10%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        for (let i = 0; i < state.triggerManager.priorityList.length; i++) {
            const trigger = state.triggerManager.priorityList[i];
            //let triggerElement = $('#script_trigger_' + trigger.seq);

            buildTriggerType(trigger);
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

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerType(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq);

        // Trigger Type
        let typeSelectNode = $('<select></select>');
        let selected = trigger.type === "tech" ? ' selected="selected"' : "";
        let typeOptionNode = $('<option value="tech"' + selected + '>Technology</option>');
        typeSelectNode.append(typeOptionNode);

        // selected = trigger.type === "bld" ? ' selected="selected"' : "";
        // typeOptionNode = $('<option value="bld"' + selected + '>Building</option>');
        // typeSelectNode.append(typeOptionNode);

        triggerElement.append(typeSelectNode);

        typeSelectNode.on('change', function() {
            trigger.updateType(this.value);
            state.triggerManager.resetTargetTriggers();

            buildTriggerRequirementType(trigger);
            buildTriggerRequirementId(trigger);
            buildTriggerRequirementCount(trigger);

            buildTriggerActionType(trigger);
            buildTriggerActionId(trigger);
            buildTriggerActionCount(trigger);
            
            updateSettingsFromState();
        });
    }

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerRequirementType(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq);
        triggerElement = triggerElement.next();
        triggerElement.empty().off("*");

        if (trigger.type === "tech") {
            let typeSelectNode = $('<select></select>');

            let selected = trigger.requirementType === "unlocked" ? ' selected="selected"' : "";
            let typeOptionNode = $('<option value = "unlocked"' + selected + '>Unlocked</option>');
            typeSelectNode.append(typeOptionNode);

            // selected = trigger.type === "researched" ? ' selected="selected"' : "";
            // typeOptionNode = $('<option value = "researched"' + selected + '>Researched</option>');
            // typeSelectNode.append(typeOptionNode);

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

        if (trigger.type === "bld") {
            // TODO: Building triggers
        }
    }

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerRequirementId(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq);
        triggerElement = triggerElement.next().next();
        triggerElement.empty().off("*");

        if (trigger.type === "tech") {
            // Requirement Id
            let typeSelectNode = $('<select style ="width:100%"></select>');

            Object.keys(tech).forEach(technology => {
                let title = tech[technology].definition.id;
                if (game.global.race.species !== speciesProtoplasm) {
                    title = typeof tech[technology].definition.title === 'string' ? tech[technology].definition.title : tech[technology].definition.title();
                }
                let selected = trigger.requirementId === technology ? ' selected="selected"' : "";
                let typeOptionNode = $('<option value = "' + technology + '"' + selected + '>' + title + '</option>');
                typeSelectNode.append(typeOptionNode);
            });

            triggerElement.append(typeSelectNode);

            typeSelectNode.on('change', function() {
                trigger.updateRequirementId(this.value);
                state.triggerManager.resetTargetTriggers();
    
                buildTriggerRequirementCount(trigger);
    
                buildTriggerActionType(trigger);
                buildTriggerActionId(trigger);
                buildTriggerActionCount(trigger);
                
                updateSettingsFromState();
            });

            return;
        }

        if (trigger.type === "bld") {
            // TODO: Building triggers
        }
    }

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerRequirementCount(trigger) {
        // let triggerElement = $('#script_trigger_' + trigger.seq);
        // triggerElement = triggerElement.next().next().next();
        //triggerElement.empty().off("*");
    }

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerActionType(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq);
        triggerElement = triggerElement.next().next().next().next();
        triggerElement.empty().off("*");

        if (trigger.type === "tech") {
            // Action Type
            let typeSelectNode = $('<select></select>');
            let selected = trigger.actionType === "research" ? ' selected="selected"' : "";
            let typeOptionNode = $('<option value = "research"' + selected + '>Research</option>');
            typeSelectNode.append(typeOptionNode);

            // selected = trigger.type === "build" ? ' selected="selected"' : "";
            // typeOptionNode = $('<option value = "build"' + selected + '>Build</option>');
            // typeSelectNode.append(typeOptionNode);

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
    }

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerActionId(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq);
        triggerElement = triggerElement.next().next().next().next().next();
        triggerElement.empty().off("*");

        if (trigger.actionType === "research") {
            // Requirement Id
            let typeSelectNode = $('<select style ="width:100%"></select>');

            Object.keys(tech).forEach(technology => {
                let title = tech[technology].definition.id;
                if (game.global.race.species !== speciesProtoplasm) {
                    title = typeof tech[technology].definition.title === 'string' ? tech[technology].definition.title : tech[technology].definition.title();
                }
                let selected = trigger.actionId === technology ? ' selected="selected"' : "";
                let typeOptionNode = $('<option value = "' + technology + '"' + selected + '>' + title + '</option>');
                typeSelectNode.append(typeOptionNode);
            });

            triggerElement.append(typeSelectNode);

            typeSelectNode.on('change', function() {
                trigger.updateActionId(this.value);
                state.triggerManager.resetTargetTriggers();
    
                buildTriggerActionCount(trigger);
                
                updateSettingsFromState();
            });

            return;
        }
    }

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerActionCount(trigger) {
        //let triggerElement = $('#script_trigger_' + trigger.seq);
        //triggerElement = triggerElement.next().next().next().next().next().next();
        //triggerElement.empty().off("*");
    }

    /**
     * @param {Trigger} trigger
     */
    function buildTriggerSettingsColumn(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq);
        triggerElement = triggerElement.next().next().next().next().next().next().next();
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
        triggerElement.append($('<span class="script-lastcolumn"></span>'));
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

        // Unification
        let unificationNode = $('<div style="margin-top: 5px; width: 400px"><label for="script_userResearchUnification">Target Unification:</label><select id="script_userResearchUnification" style="width: 150px; float: right;"></select></div>');
        currentNode.append(unificationNode);

        selectNode = $('#script_userResearchUnification');
        selected = settings.userResearchUnification === "auto" ? ' selected="selected"' : "";
        optionNode = $('<option value = "auto"' + selected + '>Script Managed</option>');
        selectNode.append(optionNode);

        selected = settings.userResearchUnification === "tech-wc_reject" ? ' selected="selected"' : "";
        optionNode = $('<option value = "tech-wc_reject"' + selected + '>Reject</option>');
        selectNode.append(optionNode);

        selected = settings.userResearchUnification === "tech-wc_money" ? ' selected="selected"' : "";
        optionNode = $('<option value = "tech-wc_money"' + selected + '>Money</option>');
        selectNode.append(optionNode);

        selected = settings.userResearchUnification === "tech-wc_morale" ? ' selected="selected"' : "";
        optionNode = $('<option value = "tech-wc_morale"' + selected + '>Morale</option>');
        selectNode.append(optionNode);

        selected = settings.userResearchUnification === "tech-wc_conquest" ? ' selected="selected"' : "";
        optionNode = $('<option value = "tech-wc_conquest"' + selected + '>Conquest</option>');
        selectNode.append(optionNode);

        selectNode.on('change', function() {
            let value = $("#script_userResearchUnification :selected").val();
            settings.userResearchUnification = value;
            updateSettingsFromState();
            //console.log("Chosen unification target of " + value);
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
        updateForeignPowerPanel(secondaryPrefix, foreignPowerNode, 0);
        updateForeignPowerPanel(secondaryPrefix, foreignPowerNode, 1);
        updateForeignPowerPanel(secondaryPrefix, foreignPowerNode, 2);

        // Campaign panel
        addStandardSectionHeader1(currentNode, "Campaigns");
        addStandardSectionSettingsNumber2(secondaryPrefix, currentNode, 0, "foreignAttackLivingSoldiersPercent", "Attack only if at least this percentage of your garrison soldiers are alive", "Only attacks if you ALSO have the target battalion size of healthy soldiers available, so this setting will only take effect if your battalion does not include all of your soldiers");
        addStandardSectionSettingsNumber2(secondaryPrefix, currentNode, 0, "foreignAttackHealthySoldiersPercent", "... and at least this percentage of your garrison is not injured", "Set to less than 100 to take advantage of being able to heal more soldiers in a game day than get wounded in a typical attack");
        addStandardSectionSettingsNumber2(secondaryPrefix, currentNode, 0, "foreignHireMercMoneyStoragePercent", "Hire mercenary if money storage greater than percent", "Hire a mercenary if money storage is greater than this percent");
        addStandardSectionSettingsNumber2(secondaryPrefix, currentNode, 0, "foreignHireMercCostLowerThan", "AND if cost lower than amount", "Combines with the money storage percent setting to determine when to hire mercenaries");

        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:25%">Campaign</th><th class="has-text-warning" style="width:25%">Minimum Attack Rating</th><th class="has-text-warning" style="width:25%">Maximum Rating to Send</th><th class="has-text-warning" style="width:25%"></th></tr>
                <tbody id="script_${secondaryPrefix}warTableBody" class="script-contenttbody"></tbody>
            </table>`);
        
        let warTableBody = $(`#script_${secondaryPrefix}warTableBody`);
        let newTableBodyText = "";

        for (let i = 0; i < state.warManager.campaignList.length; i++) {
            const campaign = state.warManager.campaignList[i];
            newTableBodyText += `<tr value="${campaign.id}"><td id="script_${secondaryPrefix}${campaign.id}Toggle" style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td></tr>`;
        }
        warTableBody.append($(newTableBodyText));

        // Build campaign settings rows
        for (let i = 0; i < state.warManager.campaignList.length; i++) {
            const campaign = state.warManager.campaignList[i];
            let warElement = $(`#script_${secondaryPrefix}${campaign.id}Toggle`);

            let toggle = $('<span class="has-text-info">' + campaign.name + '</span>');
            warElement.append(toggle);

            warElement = warElement.next();
            warElement.append(buildCampaignRatingSettingsInput(secondaryPrefix, campaign));

            warElement = warElement.next();
            warElement.append(buildCampaignMaxRatingSettingsInput(secondaryPrefix, campaign));
        }

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function updateForeignPowerPanel(secondaryPrefix, parentNode, govIndex) {
        addStandardSectionHeader2(parentNode, getGovName(govIndex))
        addStandardSectionSettingsToggle2(secondaryPrefix, parentNode, 0, "foreignAttack" + govIndex, "Attack", "Allow attacks against this foreign power. If occupied it will unoccupy just before attacking");
        addStandardSectionSettingsToggle2(secondaryPrefix, parentNode, 0, "foreignOccupy" + govIndex, "Occupy when possible", "Attempts to occupy this foreign power when available");
        addStandardSectionSettingsToggle2(secondaryPrefix, parentNode, 0, "foreignSpy" + govIndex, "Train spies", "Train spies to use against foreign powers");
        addStandardSectionSettingsNumber2(secondaryPrefix, parentNode, 0, "foreignSpyMax" + govIndex, "Maximum spies", "Maximum spies send against this foreign power");
        buildSpyOperationSelectorSetting(secondaryPrefix, parentNode, "foreignSpyOp" + govIndex, "Espionage Mission", "Perform this espionage mission whenever available");
    }

    function buildSpyOperationSelectorSetting(secondaryPrefix, parentNode, settingName, displayName, hintText) {
        let computedSelectId = `script_${secondaryPrefix}${settingName}`;
        let mainSelectId = `script_${settingName}`;
        let div = $(`<div style="margin-top: 5px; display: inline-block; width: 80%; text-align: left;"><label title="${hintText}" for="${computedSelectId}">${displayName}:</label><select id="${computedSelectId}" style="width: 150px; float: right;"></select></div>`);
        parentNode.append(div);

        let selectNode = $('#' + computedSelectId);

        Object.keys(espionageTypes).forEach(espionageKey => {
            let espionageType = espionageTypes[espionageKey];

            let selected = settings[settingName] === espionageType.id ? 'selected="selected"' : "";
            let optionNode = $(`<option value="${espionageType.id}" ${selected}>${espionageType.name()}</option>`);
            selectNode.append(optionNode);
        });

        selectNode.on('change', function() {
            let value = $(`#${computedSelectId} :selected`).val();
            settings[settingName] = value;
            updateSettingsFromState();
            
            if (secondaryPrefix !== "") {
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

                if (secondaryPrefix !== "") {
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

                if (secondaryPrefix !== "") {
                    let mainSetting = $('#' + mainSettingName);
                    mainSetting.val(rating);
                }
            }
        });

        return campaignMaxTextBox;
    }

    function buildMarketSettings() {
        let sectionId = "market";
        let sectionName = "Market";

        let resetFunction = function() {
            resetMarketState();
            resetMarketSettings();
            updateSettingsFromState();
            updateMarketSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateMarketSettingsContent);
    }

    function updateMarketSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_marketContent');
        currentNode.empty().off("*");

        updateMarketPreTable();
        updateMarketTable();

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function updateMarketPreTable() {
        let currentNode = $('#script_marketContent');

        // Add the pre table section
        currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_marketPreTable"></div>');

        // Add any pre table settings
        let preTableNode = $('#script_marketPreTable');
        addStandardSectionSettingsNumber(preTableNode, "tradeRouteMinimumMoneyPerSecond", "Trade minimum money /s", "Will trade for resources until this minimum money per second amount is hit");
    }

    function updateMarketTable() {
        let currentNode = $('#script_marketContent');
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

            let toggle = $('<span class="has-text-info" style="margin-left: 20px;">' + resource.name + '</span>');
            marketElement.append(toggle);

            marketElement = marketElement.next();
            marketElement.append(buildMarketSettingsToggle(resource, "autoBuyEnabled", "script_buy2_" + resource.id, "script_buy1_" + resource.id, "autoSellEnabled", "script_sell2_" + resource.id, "script_sell1_" + resource.id));

            marketElement = marketElement.next();
            marketElement.append(buildMarketSettingsInput(resource, "res_buy_r_" + resource.id, "autoBuyRatio"));

            marketElement = marketElement.next();
            marketElement.append(buildMarketSettingsToggle(resource, "autoSellEnabled", "script_sell2_" + resource.id, "script_sell1_" + resource.id, "autoBuyEnabled", "script_buy2_" + resource.id, "script_buy1_" + resource.id));

            marketElement = marketElement.next();
            marketElement.append(buildMarketSettingsInput(resource, "res_sell_r_" + resource.id, "autoSellRatio"));

            marketElement = marketElement.next();
            marketElement.append(buildMarketSettingsToggle(resource, "autoTradeBuyEnabled", "script_tbuy2_" + resource.id, "script_tbuy1_" + resource.id, "autoTradeSellEnabled", "script_tsell2_" + resource.id, "script_tsell1_" + resource.id));

            marketElement = marketElement.next();
            marketElement.append(buildMarketSettingsInput(resource, "res_trade_buy_mtr_" + resource.id, "autoTradeBuyRoutes"));

            marketElement = marketElement.next();
            marketElement.append(buildMarketSettingsToggle(resource, "autoTradeSellEnabled", "script_tsell2_" + resource.id, "script_tsell1_" + resource.id, "autoTradeBuyEnabled", "script_tbuy2_" + resource.id, "script_tbuy1_" + resource.id));

            marketElement = marketElement.next();
            marketElement.append(buildMarketSettingsInput(resource, "res_trade_sell_mps_" + resource.id, "autoTradeSellMinPerSecond"));

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
                    state.marketManager.priorityList[findArrayIndex(state.marketManager.priorityList, "id", marketIds[i])].marketPriority = i;
                }

                state.marketManager.sortByPriority();
                updateSettingsFromState();
            },
        } );
    }

    /**
     * @param {Resource} resource
     */
    function buildMarketSettingsToggle(resource, property, toggleId, syncToggleId, oppositeProperty, oppositeToggleId, oppositeSyncToggleId) {
        let checked = resource[property] ? " checked" : "";
        let toggle = $('<label id="' + toggleId + '" tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span></label>');

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = input.checked;
            resource[property] = state;

            let otherCheckbox =  document.querySelector('#' + syncToggleId + ' input');
            if (otherCheckbox !== null) {
                // @ts-ignore
                otherCheckbox.checked = state;
            }

            if (resource[property] && resource[oppositeProperty]) {
                resource[oppositeProperty] = false;

                let oppositeCheckbox1 =  document.querySelector('#' + oppositeToggleId + ' input');
                if (oppositeCheckbox1 !== null) {
                    // @ts-ignore
                    oppositeCheckbox1.checked = false;
                }

                let oppositeCheckbox2 =  document.querySelector('#' + oppositeSyncToggleId + ' input');
                if (oppositeCheckbox2 !== null) {
                    // @ts-ignore
                    oppositeCheckbox2.checked = false;
                }
            }

            updateSettingsFromState();
            //console.log(resource.name + " changed enabled to " + state);
        });

        return toggle;
    }

    /**
     * @param {Resource} resource
     */
    function buildMarketSettingsInput(resource, settingKey, property) {
        let textBox = $('<input type="text" class="input is-small" style="width:100%"/>');
        textBox.val(settings[settingKey]);
    
        textBox.on('change', function() {
            let val = textBox.val();
            let parsedValue = getRealNumber(val);
            if (!isNaN(parsedValue)) {
                //console.log('Setting resource max for resource ' + resource.name + ' to be ' + max);
                resource[property] = parsedValue;
                updateSettingsFromState();
            }
        });

        return textBox;
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

        updateStoragePreTable();
        updateStorageTable();

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function updateStoragePreTable() {
        let currentNode = $('#script_storageContent');

        // Add the pre table section
        //currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_storagePreTable">' + '<div><span class="has-text-danger">Storage settings have not yet been implemented! You can change them but they won\'t take effect until a future version.</span></div>' + '</div>');
        currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_storagePreTable"></div>');

        // Add any pre table settings
        let preTableNode = $('#script_storagePreTable');
        addStandardSectionSettingsToggle(preTableNode, "storageLimitPreMad", "Limit Pre-MAD Storage", "Saves resources and shortens run time by limiting storage pre-MAD");
    }

    function updateStorageTable() {
        let currentNode = $('#script_storageContent');
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:20%">Resource</th><th class="has-text-warning" style="width:20%">Enabled</th><th class="has-text-warning" style="width:20%">Weighting</th><th class="has-text-warning" style="width:20%">Max Crates</th><th class="has-text-warning" style="width:20%">Max Containers</th></tr>
                <tbody id="script_storageTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_storageTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < state.storageManager.priorityList.length; i++) {
            const resource = state.storageManager.priorityList[i];
            let classAttribute = ' class="script-draggable"';
            newTableBodyText += '<tr value="' + resource.id + '"' + classAttribute + '><td id="script_storage_' + resource.id + 'Toggle" style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other storages settings rows
        for (let i = 0; i < state.storageManager.priorityList.length; i++) {
            const resource = state.storageManager.priorityList[i];
            let storageElement = $('#script_storage_' + resource.id + 'Toggle');

            let toggle = $('<span class="has-text-info" style="margin-left: 20px;">' + resource.name + '</span>');
            storageElement.append(toggle);

            storageElement = storageElement.next();
            storageElement.append(buildStorageSettingsEnabledToggle(resource));

            storageElement = storageElement.next();
            storageElement.append(buildStorageSettingsInput(resource, "res_storage_w_" + resource.id, "autoStorageWeighting"));

            storageElement = storageElement.next();
            storageElement.append(buildStorageSettingsInput(resource, "res_crates_m_" + resource.id, "_autoCratesMax"));

            storageElement = storageElement.next();
            storageElement.append(buildStorageSettingsInput(resource, "res_containers_m_" + resource.id, "_autoContainersMax"));

            storageElement.append($('<span class="script-lastcolumn"></span>'));
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
                    state.storageManager.priorityList[findArrayIndex(state.storageManager.priorityList, "id", storageIds[i])].storagePriority = i;
                }

                state.storageManager.sortByPriority();
                updateSettingsFromState();
            },
        } );
    }

    /**
     * @param {Resource} resource
     */
    function buildStorageSettingsEnabledToggle(resource) {
        let checked = resource.autoStorageEnabled ? " checked" : "";
        let toggle = $('<label id=script_res_storage_' + resource.id + ' tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span></label>');

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = input.checked;
            resource.autoStorageEnabled = state;
            updateSettingsFromState();
            //console.log(resource.name + " changed enabled to " + state);
        });

        return toggle;
    }

    /**
     * @param {Resource} resource
     * @param {string} settingKey
     * @param {string} property
     */
    function buildStorageSettingsInput(resource, settingKey, property) {
        let textBox = $('<input type="text" class="input is-small" style="width:25%"/>');
        textBox.val(settings[settingKey]);
    
        textBox.on('change', function() {
            let val = textBox.val();
            let parsedValue = getRealNumber(val);
            if (!isNaN(parsedValue)) {
                //console.log('Setting resource max for resource ' + resource.name + ' to be ' + max);
                resource[property] = parsedValue;
                updateSettingsFromState();
            }
        });

        return textBox;
    }

    function buildProductionSettings() {
        let sectionId = "production";
        let sectionName = "Production";

        let resetFunction = function() {
            resetProductionState();
            resetProductionSettings();
            updateSettingsFromState();
            updateProductionSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateProductionSettingsContent);
    }

    function updateProductionSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_productionContent');
        currentNode.empty().off("*");

        updateProductionPreTableSmelter();
        updateProductionTableSmelter();

        updateProductionPreTableFactory();
        updateProductionTableFactory();

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function updateProductionPreTableSmelter() {
        let currentNode = $('#script_productionContent');

        // Add the pre table section
        currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_productionPreTableSmelter"></div>');

        // Add any pre table settings
        let preTableNode = $('#script_productionPreTableSmelter');
        addStandardHeading(preTableNode, "Smelter");
        //addStandardSectionSettingsToggle(preTableNode, "productionMoneyIfOnly", "Override and produce money if we can't fill factories with other production", "If all other production has been allocated and there are leftover factories then use them to produce money");
    }

    function updateProductionTableSmelter() {
        let currentNode = $('#script_productionContent');
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

            let toggle = $('<span class="has-text-info" style="margin-left: 20px;">' + fuel.resource.name + '</span>');
            productionElement.append(toggle);

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
                    state.cityBuildings.Smelter._fuelPriorityList[findArrayIndex(state.cityBuildings.Smelter._fuelPriorityList, "id", fuelIds[i])].priority = i;
                }

                state.cityBuildings.Smelter.sortByPriority();
                updateSettingsFromState();
            },
        } );
    }

    function updateProductionPreTableFactory() {
        let currentNode = $('#script_productionContent');

        // Add the pre table section
        currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_productionPreTableFactory"></div>');

        // Add any pre table settings
        let preTableNode = $('#script_productionPreTableFactory');
        addStandardHeading(preTableNode, "Factory");
        addStandardSectionSettingsToggle(preTableNode, "productionMoneyIfOnly", "Override and produce money if we can't fill factories with other production", "If all other production has been allocated and there are leftover factories then use them to produce money");
    }

    function updateProductionTableFactory() {
        let currentNode = $('#script_productionContent');
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:20%">Resource</th><th class="has-text-warning" style="width:20%">Enabled</th><th class="has-text-warning" style="width:20%">Weighting</th><th class="has-text-warning" style="width:40%"></th></tr>
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
            newTableBodyText += '<tr value="' + production.resource.id + '"' + classAttribute + '><td id="script_factory_' + production.resource.id + 'Toggle" style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:40%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < productionSettings.length; i++) {
            const production = productionSettings[i];
            let productionElement = $('#script_factory_' + production.resource.id + 'Toggle');

            let toggle = $('<span class="has-text-info" style="margin-left: 20px;">' + production.resource.name + '</span>');
            productionElement.append(toggle);

            productionElement = productionElement.next();
            productionElement.append(buildProductionSettingsEnabledToggle(production));

            productionElement = productionElement.next();
            productionElement.append(buildProductionSettingsInput(production, "production_w_" + production.resource.id, "weighting"));
        }
    }

    /**
     * @param {{ enabled: any; resource: Resource; }} production
     */
    function buildProductionSettingsEnabledToggle(production) {
        let checked = production.enabled ? " checked" : "";
        let toggle = $('<label id=script_factory_' + production.resource.id + ' tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span></label>');

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = input.checked;
            production.enabled = state;
            updateSettingsFromState();
            //console.log(resource.name + " changed enabled to " + state);
        });

        return toggle;
    }

    /**
     * @param {string} settingKey
     * @param {string} property
     * @param {{ [x: string]: number; }} production
     */
    function buildProductionSettingsInput(production, settingKey, property) {
        let textBox = $('<input type="text" class="input is-small" style="width:25%"/>');
        textBox.val(settings[settingKey]);
    
        textBox.on('change', function() {
            let val = textBox.val();
            let parsedValue = getRealNumber(val);
            if (!isNaN(parsedValue)) {
                //console.log('Setting resource max for resource ' + resource.name + ' to be ' + max);
                production[property] = parsedValue;
                updateSettingsFromState();
            }
        });

        return textBox;
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

        updateJobPreTable();
        updateJobTable();

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function updateJobPreTable() {
        let currentNode = $('#script_jobContent');

        // Add the pre table section
        currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_jobPreTable"></div>');

        // Add any pre table settings
        let preTableNode = $('#script_jobPreTable');
        addStandardSectionSettingsNumber(preTableNode, "jobLumberWeighting", "Final Lumberjack Weighting", "AFTER allocating breakpoints this weighting will be used to split lumberjacks, quarry workers and scavengers");
        addStandardSectionSettingsNumber(preTableNode, "jobQuarryWeighting", "Final Quarry Worker Weighting", "AFTER allocating breakpoints this weighting will be used to split lumberjacks, quarry workers and scavengers");
        addStandardSectionSettingsNumber(preTableNode, "jobScavengerWeighting", "Final Scavenger Weighting", "AFTER allocating breakpoints this weighting will be used to split lumberjacks, quarry workers and scavengers");
    }

    function updateJobTable() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_jobContent');
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:25%">Job</th><th class="has-text-warning" style="width:25%">1st Pass Max</th><th class="has-text-warning" style="width:25%">2nd Pass Max</th><th class="has-text-warning" style="width:25%">Final Max</th></tr>
                <tbody id="script_jobTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_jobTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < state.jobManager.priorityList.length; i++) {
            const job = state.jobManager.priorityList[i];
            let classAttribute = job !== state.jobs.Farmer ? ' class="script-draggable"' : ' class="unsortable"';
            newTableBodyText += '<tr value="' + job._originalId + '"' + classAttribute + '><td id="script_' + job._originalId + 'Toggle" style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td></tr>';
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
                    state.jobManager.priorityList[findArrayIndex(state.jobManager.priorityList, "_originalId", jobIds[i])].priority = i + 1; // farmers is always 0
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
        let toggle = $('<label tabindex="0" class="switch" style="position:absolute;' + marginTop + ' margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span' + classAttribute + ' style="margin-left: 20px;">' + job._originalName + '</span></label>');

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
        let lastSpan = breakpoint === 3 && job !== state.jobs.Farmer ? '<span class="script-lastcolumn"></span>' : "";

        if (job === state.jobs.Farmer || (breakpoint === 3 && (job === state.jobs.Lumberjack || job === state.jobs.QuarryWorker || job === state.jobs.Scavenger))) {
            let span = $('<span>Managed</span>' + lastSpan);
            return span;
        }

        let jobBreakpointTextbox = $('<input type="text" class="input is-small" style="width:25%"/>' + lastSpan);
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

    function buildBuildingSettings() {
        let sectionId = "building";
        let sectionName = "Building";

        let resetFunction = function() {
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

        updateBuildingPreTable();
        updateBuildingTable();

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function updateBuildingPreTable() {
        // let currentNode = $('#script_marketContent');
        // currentNode.append(
        //     `<div style="margin-top: 10px; margin-bottom: 10px;" id="script_marketPreTable">
        //         <div style="margin-top: 5px; width: 400px"><label for="script_market_minmoneypersecond">Trade minimum money /s</label><input id="script_market_minmoneypersecond" type="text" class="input is-small" style="width: 150px; float: right;"></input></div>
        //     </div>`
        // );

        // let textBox = $('#script_market_minmoneypersecond');
        // textBox.val(settings.tradeRouteMinimumMoneyPerSecond);
    
        // textBox.on('change', function() {
        //     let val = textBox.val();
        //     let parsedValue = getRealNumber(val);
        //     if (!isNaN(parsedValue)) {
        //         //console.log('Setting resource max for resource ' + resource.name + ' to be ' + max);
        //         settings.tradeRouteMinimumMoneyPerSecond = parsedValue;
        //         updateSettingsFromState();
        //     }
        // });
    }

    function updateBuildingTable() {
        let currentNode = $('#script_buildingContent');
        currentNode.append(
            `<div><input id="script_buildingSearch" class="script-searchsettings" type="text" placeholder="Search for buildings.."></div>
            <table style="width:100%"><tr><th class="has-text-warning" style="width:40%">Building</th><th class="has-text-warning" style="width:20%">Auto Build</th><th class="has-text-warning" style="width:20%">Max Build</th><th class="has-text-warning" style="width:20%">Manage State</th></tr>
                <tbody id="script_buildingTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_buildingTableBody');
        let newTableBodyText = "";

        $("#script_buildingSearch").on("keyup", filterBuildingSettingsTable); // Add building filter

        // Add in a first row for switching "All"
        newTableBodyText += '<tr value="All" class="unsortable"><td id="script_bldallToggle" style="width:40%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td></tr>';

        for (let i = 0; i < state.buildingManager.priorityList.length; i++) {
            const building = state.buildingManager.priorityList[i];
            let classAttribute = ' class="script-draggable"';
            newTableBodyText += '<tr value="' + building.settingId + '"' + classAttribute + '><td id="script_' + building.settingId + 'Toggle" style="width:40%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td></tr>';
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

        // state column
        buildingElement = buildingElement.next();
        toggle = buildAllBuildingStateSettingsToggle(state.buildingManager.priorityList);
        buildingElement.append(toggle);

        // Build all other buildings settings rows
        for (let i = 0; i < state.buildingManager.priorityList.length; i++) {
            const building = state.buildingManager.priorityList[i];
            let buildingElement = $('#script_' + building.settingId + 'Toggle');

            let classAttribute = building._tab === "city" ? ' class="has-text-info"' : ' class="has-text-danger"';
            let toggle = $('<span' + classAttribute + ' style="margin-left: 20px;">' + building.name + '</span>');
            buildingElement.append(toggle);

            buildingElement = buildingElement.next();
            toggle = buildBuildingEnabledSettingsToggle(building);
            buildingElement.append(toggle);

            buildingElement = buildingElement.next();
            buildingElement.append(buildBuildingMaxSettingsInput(building));

            buildingElement = buildingElement.next();
            toggle = buildBuildingStateSettingsToggle(building);
            buildingElement.append(toggle);
        }

        $('#script_buildingTableBody').sortable( {
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                var $clone =  $(ui).clone();
                $clone .css('position','absolute');
                return $clone.get(0);
            },
            update: function() {
                let buildingIds = $('#script_buildingTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < buildingIds.length; i++) {
                    // Building has been dragged... Update all building priorities
                    if (buildingIds[i] !== "All") {
                        state.buildingManager.priorityList[findArrayIndex(state.buildingManager.priorityList, "settingId", buildingIds[i])].priority = i - 1;
                    }
                }

                state.buildingManager.sortByPriority();
                updateSettingsFromState();
            },
        } );
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
    }

    /**
     * @param {Action} building
     */
    function buildBuildingEnabledSettingsToggle(building) {
        let checked = building.autoBuildEnabled ? " checked" : "";
        let toggle = $('<label id=script_bat2_' + building.settingId + ' tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span></label>');

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = input.checked;
            building.autoBuildEnabled = state;
            //$('#script_bat1_' + building.settingId + ' input').checked = state; // Update the on-building toggle
            let otherCheckbox =  document.querySelector('#script_bat1_' + building.settingId + ' input');
            if (otherCheckbox !== null) {
                // @ts-ignore
                otherCheckbox.checked = state;
            }
            updateSettingsFromState();
            //console.log(building.name + " changed enabled to " + state);
        });

        return toggle;
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

    /**
     * @param {Action} building
     */
    function buildBuildingMaxSettingsInput(building) {
        let buildingMaxTextBox = $('<input type="text" class="input is-small" style="width:25%"/>');
        buildingMaxTextBox.val(settings["bld_m_" + building.settingId]);
    
        buildingMaxTextBox.on('change', function() {
            let val = buildingMaxTextBox.val();
            let max = getRealNumber(val);
            if (!isNaN(max)) {
                //console.log('Setting building max for building ' + building.name + ' to be ' + max);
                building.autoMax = max;
                updateSettingsFromState();
            }
        });

        return buildingMaxTextBox;
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

        updateProjectPreTable();
        updateProjectTable();

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function updateProjectPreTable() {
        let currentNode = $('#script_projectContent');

        // Add the pre table section
        currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_projectPreTable"></div>');

        // Add any pre table settings
        let preTableNode = $('#script_projectPreTable');
        addStandardSectionSettingsToggle(preTableNode, "arpaBuildIfStorageFull", "Override and build if storage is full", "Overrides the below settings to still build A.R.P.A projects if resources are full");
        addStandardSectionSettingsNumber(preTableNode, "arpaBuildIfStorageFullCraftableMin", "Minimum craftables to keep if overriding", "A.R.P.A. projects that require crafted resources won't override and build if resources are below this amount");
        addStandardSectionSettingsNumber(preTableNode, "arpaBuildIfStorageFullResourceMaxPercent", "Maximim percent of resources if overriding", "A.R.P.A. project that require more than this percentage of a non-crafted resource won't override and build");
    }

    function updateProjectTable() {
        let currentNode = $('#script_projectContent');
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:25%">Project</th><th class="has-text-warning" style="width:25%">Max Build</th><th class="has-text-warning" style="width:25%">Ignore Min Money</th><th class="has-text-warning" style="width:25%"></th></tr>
                <tbody id="script_projectTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_projectTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < state.projectManager.priorityList.length; i++) {
            const project = state.projectManager.priorityList[i];
            let classAttribute = ' class="script-draggable"';
            newTableBodyText += '<tr value="' + project.id + '"' + classAttribute + '><td id="script_' + project.id + 'Toggle" style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other projects settings rows
        for (let i = 0; i < state.projectManager.priorityList.length; i++) {
            const project = state.projectManager.priorityList[i];
            let projectElement = $('#script_' + project.id + 'Toggle');

            let toggle = buildProjectSettingsToggle(project);
            projectElement.append(toggle);

            projectElement = projectElement.next();
            projectElement.append(buildProjectMaxSettingsInput(project));

            projectElement = projectElement.next();
            projectElement.append(buildProjectIgnoreMinMoneySettingsToggle(project));
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
                    state.projectManager.priorityList[findArrayIndex(state.projectManager.priorityList, "id", projectIds[i])].priority = i;
                }

                state.projectManager.sortByPriority();
                updateSettingsFromState();
            },
        } );
    }

    /**
     * @param {Project} project
     */
    function buildProjectSettingsToggle(project) {
        let checked = project.autoBuildEnabled ? " checked" : "";
        let toggle = $('<label id="script_arpa2_' + project.id + '" tabindex="0" class="switch" style="position:absolute; margin-top: 4px; margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span class="has-text-info" style="margin-left: 20px;">' + project.name + '</span></label>');

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = input.checked;
            project.autoBuildEnabled = state;
            // @ts-ignore
            document.querySelector('#script_arpa1_' + project.id + ' input').checked = state;
            updateSettingsFromState();
            //console.log(project.name + " changed enabled to " + state);
        });

        return toggle;
    }

    /**
     * @param {Project} project
     */
    function buildProjectMaxSettingsInput(project) {
        let projectMaxTextBox = $('<input type="text" class="input is-small" style="width:25%"/>');
        projectMaxTextBox.val(settings["arpa_m_" + project.id]);
    
        projectMaxTextBox.on('change', function() {
            let val = projectMaxTextBox.val();
            let max = getRealNumber(val);
            if (!isNaN(max)) {
                //console.log('Setting max for project ' + project.name + ' to be ' + max);
                project.autoMax = max;
                updateSettingsFromState();
            }
        });

        return projectMaxTextBox;
    }

    function buildProjectIgnoreMinMoneySettingsToggle(project) {
        let checked = project.ignoreMinimumMoneySetting ? " checked" : "";
        let toggle = $('<label id="script_arpa_ignore_money_' + project.id + '" tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span></label>');

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = input.checked;
            project.ignoreMinimumMoneySetting = state;
            updateSettingsFromState();
        });

        return toggle;
    }

    function buildLoggingSettings(parentNode, isMainSettings) {
        let sectionId = "logging";
        let sectionName = "Logging";

        let resetFunction = function() {
            //resetGeneralState();
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

        // Add the pre table section
        currentNode.append(`<div id="script_${secondaryPrefix}loggingPreTable"></div>`);

        // Add any pre table settings
        let preTableNode = $(`#script_${secondaryPrefix}loggingPreTable`);
        addStandardSectionSettingsToggle2(secondaryPrefix, preTableNode, 0, "logEnabled", "Enable logging", "Master switch to enable logging of script actions in the game message queue");

        Object.keys(loggingTypes).forEach(loggingTypeKey => {
            let loggingType = loggingTypes[loggingTypeKey];
            addStandardSectionSettingsToggle2(secondaryPrefix, preTableNode, 1, loggingType.settingKey, loggingType.name, `If logging is enabled then logs ${loggingType.name} actions`);
        });

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function createQuickOptions(optionsElementId, optionsDisplayName, buildOptionsFunction) {
        let container = $('#autoScriptContainer');
        let optionsDiv = $(`<div style="cursor: pointer;" id="${optionsElementId}">${optionsDisplayName} Options</div>`);
        container.append(optionsDiv);

        addOptionUI(optionsElementId + "_btn", `#${optionsElementId}`, optionsDisplayName, buildOptionsFunction);
        addOptionUiClickHandler(optionsDiv, optionsDisplayName, buildOptionsFunction);
    }

    function createSettingToggle(name, enabledCallBack, disabledCallBack) {
        let elm = $('#autoScriptContainer');
        let checked = settings[name] ? " checked" : "";
        let toggle = $(`<label tabindex="0" class="switch" id="${name}" style=""><input type="checkbox" value=${settings[name]}${checked}/> <span class="check"></span><span>${name}</span></label></br>`);
        elm.append(toggle);

        if (settings[name]) {
            if (enabledCallBack !== undefined) {
                enabledCallBack();
            }
        }

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = !(input.getAttribute('value') === "true");

            if (name === "autoMAD" && input.checked && isResearchUnlocked("mad")) {
                let confirmation = confirm("MAD has already been researched. This may MAD immediately. Are you sure you want to enable autoMAD?");
                if (!confirmation) {
                    input.checked = false;
                    return;
                }
            }

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

        if ($('#autoScriptContainer').length === 0) {
            let autoScriptContainer = $('<div id="autoScriptContainer"></div>');
            $('#resources').append(autoScriptContainer);
            resetScrollPositionRequired = true;
        }

        if ($("#script_settings").length === 0) {
            createScriptSettings();
        }
        
        createOptionsModal();
        updateOptionsUI();
        
        let autoScriptContainerNode = document.querySelector('#autoScriptContainer');
        if (autoScriptContainerNode.nextSibling !== null) {
            autoScriptContainerNode.parentNode.appendChild(autoScriptContainerNode);
            resetScrollPositionRequired = true;
        }
        if ($('#autoScriptInfo').length === 0) {
            let elm = $('#autoScriptContainer');
            let span = $('<label id="autoScriptInfo">More script options available in Settings tab</label></br>');
            elm.append(span);
        }
        if ($('#masterScriptToggle').length === 0) {
            createSettingToggle('masterScriptToggle');
        }
        if ($('#autoEvolution').length === 0) {
            createSettingToggle('autoEvolution');
        }
        if ($('#autoAchievements').length === 0) {
            createSettingToggle('autoAchievements');
        }
        if ($('#autoChallenge').length === 0) {
            createSettingToggle('autoChallenge');
        }
        if ($('#autoFight').length === 0) {
            createSettingToggle('autoFight');
        }
        if ($('#autoTax').length === 0) {
            createSettingToggle('autoTax');
        }
        if ($('#autoCraft').length === 0) {
            createSettingToggle('autoCraft', createCraftToggles, removeCraftToggles);
        } else if (settings.autoCraft && $('.ea-craft-toggle').length === 0) {
            createCraftToggles();
        }
        if ($('#autoBuild').length === 0) {
            createSettingToggle('autoBuild', createBuildingToggles, removeBuildingToggles);
        } else if (settings.autoBuild && $('.ea-building-toggle').length === 0) {
            createBuildingToggles();
        }
        if ($('#autoPower').length === 0) {
            createSettingToggle('autoPower');
        }
        if ($('#autoStorage').length === 0) {
            createSettingToggle('autoStorage');
        }
        if ($('#autoMarket').length === 0) {
            createSettingToggle('autoMarket', createMarketToggles, removeMarketToggles);
        } else if (settings.autoMarket > 0 && $('.ea-market-toggle').length === 0 && isMarketUnlocked()) {
            createMarketToggles()
        }
        if ($('#autoResearch').length === 0) {
            createSettingToggle('autoResearch');
        }
        if ($('#autoARPA').length === 0) {
            createSettingToggle('autoARPA', createArpaToggles, removeArpaToggles);
        } else if (settings.autoARPA && $('.ea-arpa-toggle').length === 0) {
            createArpaToggles();
        }

        if ($('#autoJobs').length === 0) {
            createSettingToggle('autoJobs');
        }
        if ($('#autoCraftsmen').length === 0) {
            createSettingToggle('autoCraftsmen');
        }

        if ($('#autoSmelter').length === 0) {
            createSettingToggle('autoSmelter');
        }
        if ($('#autoFactory').length === 0) {
            createSettingToggle('autoFactory');
        }
        if ($('#autoMiningDroid').length === 0) {
            createSettingToggle('autoMiningDroid');
        }
        if ($('#autoGraphenePlant').length === 0) {
            createSettingToggle('autoGraphenePlant');
        }
        if ($('#autoAssembleGene').length === 0) {
            createSettingToggle('autoAssembleGene');
        }

        if (document.getElementById("s-quick-prestige-options") === null) { createQuickOptions("s-quick-prestige-options", "Prestige", buildPrestigeSettings); }

        if (showLogging && $('#autoLogging').length === 0) {
           createSettingToggle('autoLogging');

           let settingsDiv = $('<div id="ea-logging"></div>');
           let logTypeTxt = $('<div>Logging Type:</div>')
           let logTypeInput = $('<input type="text" class="input is-small" style="width:32%"/>');
           logTypeInput.val(loggingType);
           let setBtn = $('<a class="button is-dark is-small" id="set-loggingType"><span>set</span></a>');
           settingsDiv.append(logTypeTxt).append(logTypeInput).append(setBtn);
           $('#autoScriptContainer').append(settingsDiv);

           setBtn.on('mouseup', function() {
               let val = logTypeInput.val();
               loggingType = val;
           });
        }
        if ($('#bulk-sell').length === 0 && isMarketUnlocked()) {
            let bulkSell = $('<a class="button is-dark is-small" id="bulk-sell"><span>Bulk Sell</span></a>');
            $('#autoScriptContainer').append(bulkSell);
            bulkSell.on('mouseup', function(e) {
                autoMarket(true, true);
            });
        } if ($('#ea-settings').length === 0) {
            let settingsDiv = $('<div id="ea-settings"></div>');
            let minMoneyTxt = $('<div>Minimum money to keep :</div>')
            let minMoneyInput = $('<input type="text" class="input is-small" style="width:32%"/>');
            let minimumMoneyValue = settings.minimumMoney > 0 ? settings.minimumMoney : settings.minimumMoneyPercentage;
            minMoneyInput.val(minimumMoneyValue);
            let setBtn = $('<a class="button is-dark is-small" id="set-min-money"><span>Set</span></a>');
            let setPercentBtn = $('<a class="button is-dark is-small" id="set-min-money" title="eg. 10 equals 10%"><span>Set %</span></a>');
            settingsDiv.append(minMoneyTxt).append(minMoneyInput).append(setBtn).append(setPercentBtn);
            $('#autoScriptContainer').append(settingsDiv);

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
            document.querySelector('#script_arpa2_' + project.id + ' input').checked = state;
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
        let toggle = $(`<label tabindex="0" class="switch ea-craft-toggle" style="position:absolute; max-width:75px;margin-top: 4px;left:8%;"><input type="checkbox" value=${craftable.autoCraftEnabled}${checked}/> <span class="check" style="height:5px;"></span></label>`);
        resourceSpan.append(toggle);
        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = !(input.getAttribute('value') === "true");
            input.setAttribute('value', state);
            craftable.autoCraftEnabled = state;
            updateSettingsFromState();
        });
    }

    function createCraftToggles() {
        removeCraftToggles();
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
            //$('#script_bat2_' + building.settingId + ' input').checked = state; // Update the settings-building toggle
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
        let marketRow = $('#market-' + resource.id);
        let toggleBuy = $('<label id="script_buy1_' +  resource.id + '" tabindex="0" title="Enable buying of this resource. When to buy is set in the Settings tab."  class="switch ea-market-toggle" style=""><input type="checkbox"' + autoBuyChecked + '> <span class="check" style="height:5px;"></span><span class="control-label" style="font-size: small;">buy</span><span class="state"></span></label>');
        let toggleSell = $('<label id="script_sell1_' +  resource.id + '" tabindex="0" title="Enable selling of this resource. When to sell is set in the Settings tab."  class="switch ea-market-toggle" style=""><input type="checkbox"' + autoSellChecked + '> <span class="check" style="height:5px;"></span><span class="control-label" style="font-size: small;">sell</span><span class="state"></span></label>');
        let toggleTrade = $('<label id="script_tbuy1_' +  resource.id + '" tabindex="0" title="Enable trading for this resource. Max routes is set in the Settings tab." class="switch ea-market-toggle" style=""><input type="checkbox"' + autoTradeBuyChecked + '> <span class="check" style="height:5px;"></span><span class="control-label" style="font-size: small;">trade for</span><span class="state"></span></label>');
        marketRow.append(toggleBuy);
        marketRow.append(toggleSell);
        marketRow.append(toggleTrade);

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

            if (resource.autoBuyEnabled && resource.autoSellEnabled) {
                resource.autoSellEnabled = false;

                let sellCheckBox1 = document.querySelector('#script_sell1_' + resource.id + ' input');
                if (sellCheckBox1 !== null) {
                    // @ts-ignore
                    sellCheckBox1.checked = false;
                }

                let sellCheckBox2 = document.querySelector('#script_sell2_' + resource.id + ' input');
                if (sellCheckBox2 !== null) {
                    // @ts-ignore
                    sellCheckBox2.checked = false;
                }
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

            if (resource.autoSellEnabled && resource.autoBuyEnabled) {
                resource.autoBuyEnabled = false;

                let buyCheckBox1 = document.querySelector('#script_buy1_' + resource.id + ' input');
                if (buyCheckBox1 !== null) {
                    // @ts-ignore
                    buyCheckBox1.checked = false;
                }

                let buyCheckBox2 = document.querySelector('#script_buy2_' + resource.id + ' input');
                if (buyCheckBox2 !== null) {
                    // @ts-ignore
                    buyCheckBox2.checked = false;
                }
            }

            updateSettingsFromState();
            //console.log(state);
        });

        toggleTrade.on('change', function(e) {
            //console.log(e);
            let input = e.currentTarget.children[0];
            let state = input.checked;
            resource.autoTradeBuyEnabled = state;
            let otherCheckbox = document.querySelector('#script_tbuy2_' + resource.id + ' input');
            if (otherCheckbox !== null) {
                // @ts-ignore
                otherCheckbox.checked = state;
            }

            if (resource.autoTradeBuyEnabled && resource.autoTradeSellEnabled) {
                resource.autoTradeSellEnabled = false;

                let buyCheckBox1 = document.querySelector('#script_tsell1_' + resource.id + ' input');
                if (buyCheckBox1 !== null) {
                    // @ts-ignore
                    buyCheckBox1.checked = false;
                }

                let buyCheckBox2 = document.querySelector('#script_tsell2_' + resource.id + ' input');
                if (buyCheckBox2 !== null) {
                    // @ts-ignore
                    buyCheckBox2.checked = false;
                }
            }

            updateSettingsFromState();
            //console.log(state);
        });
    }

    function createMarketToggles() {
        removeMarketToggles();
        for (let i = 0; i < state.marketManager.priorityList.length; i++) {
            createMarketToggle(state.marketManager.priorityList[i]);
        }
    }

    function removeMarketToggles() {
        $('.ea-market-toggle').remove();
    }

    //#endregion UI

    //#region Utility Functions

    function isNoPlasmidChallenge() {
        // This isn't a good way to detect this but it will do for now
        return !state.jobManager.canManualCraft()
    }

    function isLowPlasmidCount() {
        return resources.Plasmid.currentQuantity < 500 || isNoPlasmidChallenge()
    }

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
     * @param {number} buyValue
     * @return {boolean}
     */
    function wouldBreakMoneyFloor(buyValue) {
        if (buyValue <= 0) {
            return false;
        }

        return resources.Money.currentQuantity - buyValue < state.minimumMoneyAllowed;
    }

    /**
     * @return {string}
     */
    function getRaceId() {
        
        let raceNameNode = document.querySelector('#race .column > span');
        if (raceNameNode === null) {
            return "";
        }

        let index = findArrayIndex(raceAchievementList, "name", raceNameNode.textContent);

        if (index === -1) {
            if (game !== null) {
                return game.global.race.species;
            } else {
                return "custom";
            }
        }

        return raceAchievementList[index].id;
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

    function removePoppers() {
        let poppers = document.querySelectorAll('[id^="pop"]'); // popspace_ and // popspc

        for (let i = 0; i < poppers.length; i++) {
            poppers[i].remove();
        }
    }

    /**
     * @param {any[]} array
     * @param {string} propertyName
     * @param {any} propertyValue
     */
    function findArrayIndex(array, propertyName, propertyValue) {
        for (let i = 0; i < array.length; i++) {
            if (array[i][propertyName] === propertyValue) {
                return i;
            }
        }
        
        return -1;
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

    // Alt tabbing can leave modifier keys pressed. When the window loses focus release all modifier keys.
    $(window).on('blur', function(e) {
        let keyboardEvent = document.createEvent("KeyboardEvent");
        // @ts-ignore
        var initMethod = typeof keyboardEvent.initKeyboardEvent !== 'undefined' ? "initKeyboardEvent" : "initKeyEvent";

        keyboardEvent[initMethod](
          "keyup", // event type: keydown, keyup, keypress
          true,      // bubbles
          true,      // cancelable
          window,    // view: should be window
          false,     // ctrlKey
          false,     // altKey
          false,     // shiftKey
          false,     // metaKey
          0,        // keyCode: unsigned long - the virtual key code, else 0
          0          // charCode: unsigned long - the Unicode character associated with the depressed key, else 0
        );
        document.dispatchEvent(keyboardEvent);
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
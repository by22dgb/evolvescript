// ==UserScript==
// @name         Evolve
// @namespace    http://tampermonkey.net/
// @version      3.3.1.33
// @description  try to take over the world!
// @downloadURL  https://gist.github.com/Vollch/b1a5eec305558a48b7f4575d317d7dd1/raw/evolve_automation.user.js
// @author       Fafnir
// @author       TMVictor
// @author       Vollch
// @match        https://tmvictor.github.io/Evolve-Scripting-Edition/
// @match        https://pmotschmann.github.io/Evolve/
// @grant        none
// @require      https://code.jquery.com/jquery-3.4.1.min.js
// @require      https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// ==/UserScript==
//
// This script forked from TMVictor's script version 3.3.1. Original script: https://gist.github.com/TMVictor/3f24e27a21215414ddc68842057482da
//
// Changes from original version:
//   Scripting Edition no longer required, works both with fork and original game
//   Added Andromeda support, auto fleet, auto galaxy trades, and all buildings with their supports and consumptions
//   Remade autoBuild, all buildings now can have individual weights, plus dynamic coefficients to weights(like, increasing weights of power plants when you need more energy), plus additional safe-guards checking for resource usage, available support, and such. You can fine-tune script to build what you actually need, and save resources for further constructions.
//   Added autoQuarry option, which manages stone to chrysotile ratio for smoldering races. autoMiningDroid now configurable, and can mine for resources other than adamantine.
//   Remade autoSmelter, now it tries to balance iron and steel income to numbers where both of resources will be full at same time(as close to that as possible). Less you have, more time it'll take to fill, more smelters will be reassigned to lacking resource, and vice versa. And it also can use star power and inferno as fuel.
//   Remade autoCraftsmen, it assigns all crafters to same resource at once, to utilize apprentice bonus, and rotates them between resources aiming to desired ratio of stored resources
//   Remade autoStorage, it calculates required storages, based on available techs and buildings, and assign storages to make them all affordable. Weighting option is gone as it not needed anymore, just rearrange list to change filling order when storages are scarce. Max crate\containers for individual reources still exist, and respected by adjustments.
//   Required amount of resources also taken in account by autoCraftsmen(they can prioritize what's actually needed), and ARPA got an option("-1" craftables to keep) to keep required amount of craftables, instead of some static number
//   Pre-mad storage limit doesn't completely prevents constructing crates and containers, it just make it work above certain ratio(80%+ steel storage for containers, and more-than-you-need-for-next-library for crates)
//   You can enable buying and selling of same resource at same time, depends on whether you're lacking something, or have a surplus. Works both with regular trade, and routes.
//   Expanded triggers, they got "researched" and "built" conditions, and "build" action.
//   Added option to prioritize resources for queued\triggered buildings\researches, it can adjust trades and production to get requested thing sooner
//   Reworked fighting\spying. At first glance it have less configurable options now, but range of possible outcomes is wider, and route to them is more optimal. With default settings it'll sabotage, plunder, and then annex all foreign powers, gradually moving from top to bottom of the list, as they becomes weak enough, and then occupy last city to finish unification. By tweaking settings it's possible to configure script to get any unification achievement(annex\purchase\occupy\reject, with or without pacifism).
//   Added options to configure auto clicking resources. Abusable, works like in original script by default. Spoil your game at your own risk.
//   Added evolutions queue. If queue enabled and not empty, settings from top of the list will be applied before next evolution, and then removed from queue. When you add new evolution to queue script stores currently configured race, prestige type, and challenges. Evolution settings can also be edited manualy, and can store any settings, but be very careful doing that, as those data will be imported intro script settings without any validation, except for synthax and type checks.
//   Standalone autoAchievements option is gone. It's now selectable as a race. Conditional races now can be chosen by auto achievements during random evolution. With mass extinction perk conditional races will be prioritized, so you can faster finish with planet's achievments, and move to the next one. During bioseed runs it'll go for races with no greatness achievement. Auto planet selection also can go for planet with most achievements.
//   Added option to soft reset after evolution, when sentience gives wrong races.
//   A lot of other small changes all around, optimisations, bug fixes, refactoring, etc. Most certainly added bunch of new bugs :)
//
// And, of course, you can do whatever you want with my changes. Fork further, backport any patches back(no credits required). Whatever.

(function($) {
    'use strict';
    var settings = JSON.parse(localStorage.getItem('settings')) ?? {};

    var game = null;
    var win = null;

    var showLogging = false;
    var loggingType = "autoJobs";

    // Just calling vue in loop actually much faster than dispatching keyboard events to set multipliers, even loops with dozens of thousands call(tested on ejectors)
    // Though, i can't exclude the possibility that game have some exceptionally slow vue somewhere That requires more testing and profiling before this multiplayer can be completely removed
    var useMultiplier = false;

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

    class NoMultiplier {
        constructor() {
            this._remainder = 0;
            this._lastLoopCounter = 0;
        }

        reset(value) {
            this._remainder = value;
            if (this._lastLoopCounter !== state.loopCounter && game.global.settings.mKeys) {
                this._lastLoopCounter = state.loopCounter
                document.dispatchEvent(new KeyboardEvent("keyup", {key: game.global.settings.keyMap.x10}));
                document.dispatchEvent(new KeyboardEvent("keyup", {key: game.global.settings.keyMap.x25}));
                document.dispatchEvent(new KeyboardEvent("keyup", {key: game.global.settings.keyMap.x100}));
            }
        }

        get remainder() {
            return this._remainder;
        }

        setMultiplier() {
            this._remainder--;
            return 1;
        }
    }

    class Multiplier {
        constructor() {
            this._remainder = 0;
            this._state = {x100: false, x25: false, x10: false};
        }

        set(key, state) {
            if (state !== this._state[key]) {
                this._state[key] = state;
                let eventName = state ? "keydown" : "keyup";
                document.dispatchEvent(new KeyboardEvent(eventName, {key: game.global.settings.keyMap[key]}));
            }
        }

        reset(value, allowOveruse) {
            if (allowOveruse && value > 1 && game.global.settings.mKeys) {
                this._state = {x100: false, x25: false, x10: false};
                this.set("x100", true);
                this.set("x25", true);
                this.set("x10", true);
                this._remainder = Math.ceil(value / 25000) * 25000
            } else {
                this._state = {x100: true, x25: true, x10: true};
                this.set("x100", false);
                this.set("x25", false);
                this.set("x10", false);
                this._remainder = value;
            }
        }

        get remainder() {
            if (this._remainder <= 0) {
                this.set("x100", false);
                this.set("x25", false);
                this.set("x10", false);
            }
            return this._remainder;
        }

        setMultiplier() {
            if (this._remainder <= 0) {
                this.set("x100", false);
                this.set("x25", false);
                this.set("x10", false);
                return 0;
            }

            if (!game.global.settings.mKeys) {
                // Multiplier disabled? Mkay... Let's take a long road.
                this._remainder -= 1;
                return 1;
            } else if (this._remainder >= 25000) {
                this.set("x100", true);
                this.set("x25", true);
                this.set("x10", true);
                this._remainder -= 25000;
                return 25000;
            } else if (this._remainder >= 2500) {
                this.set("x100", true);
                this.set("x25", true);
                this.set("x10", false);
                this._remainder -= 2500;
                return 2500;
            } else if (this._remainder >= 1000) {
                this.set("x100", true);
                this.set("x25", false);
                this.set("x10", true);
                this._remainder -= 1000;
                return 1000;
            } else if (this._remainder >= 250) {
                this.set("x100", false);
                this.set("x25", true);
                this.set("x10", true);
                this._remainder -= 250;
                return 250;
            } else if (this._remainder >= 100) {
                this.set("x100", true);
                this.set("x25", false);
                this.set("x10", false);
                this._remainder -= 100;
                return 100;
            } else if (this._remainder >= 25) {
                this.set("x100", false);
                this.set("x25", true);
                this.set("x10", false);
                this._remainder -= 25;
                return 25;
            } else if (this._remainder >= 10) {
                this.set("x100", false);
                this.set("x25", false);
                this.set("x10", true);
                this._remainder -= 10;
                return 10;
            } else {
                this.set("x100", false);
                this.set("x25", false);
                this.set("x10", false);
                this._remainder -= 1;
                return 1;
            }
        }
    }

    class Job {
        /**
         * @param {string} id
         * @param {string} name
         */
        constructor(id, name) {
            // Private properties
            this._originalId = id;
            this._originalName = name;
            this._vueBinding = "civ-" + this._originalId;

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

            return game.global.civic[this._originalId];
        }

        get id() {
            if (this.jobOverride !== null) {
                return this.jobOverride.id;
            }

            return this.definition.job;
        }

        get name() {
            if (this.jobOverride !== null) {
                return this.jobOverride.name;
            }

            return this.definition.name;
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

            return poly.craftCost()[this._originalId] !== undefined;
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

            if (this.definition.max === -1) {
                return Number.MAX_SAFE_INTEGER;
            }

            return this.definition.max;
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

            let vue = getVueById(this._vueBinding);
            if (vue !== undefined) {
                state.multiplier.reset(count, this.count + count >= this.max);
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

            let vue = getVueById(this._vueBinding);
            if (vue !== undefined) {
                state.multiplier.reset(count, this.count - count <= 0);
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
                getVueById(this._vueBinding)?.setDefault(this.id);
            }
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
                state.multiplier.reset(count, this.count + count >= this.max);
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

            let vue = getVueById(this._vueBinding);
            if (vue !== undefined) {
                state.multiplier.reset(count, this.count - count <= 0);
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
            getVueById(this._vueBinding)?.setDefault();
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

            this._vueBinding = this._elementId;

            this.autoBuildEnabled = true;
            this.autoStateEnabled = true;
            this._autoMax = -1;

            this._weighting = 100;
            this.weighting = 0;
            this.extraDescription = "";

            this.priority = 0;

            /** @type {{ resource: Resource, rate: number, }[]} */
            this.consumption = [];

            /** @type {ResourceRequirement[]} */
            this.resourceRequirements = [];

            this.overridePowered = undefined;

            // Additional flags
            this.is = flags ?? {};
        }

        get definition() {
            if (this._location !== "") {
                return game.actions[this._tab][this._location][this._id];
            } else {
                return game.actions[this._tab][this._id];
            }
        }

        get instance() {
            return game.global[this._tab][this._id];
        }

        //#region Standard actions

        get id() {
            return this._id;
        }

        get title() {
            if (this.definition !== undefined) {
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

        isSwitchable() {
            return this.definition.hasOwnProperty("powered") || this.definition.hasOwnProperty("switchable");
        }

        // export function checkPowerRequirements(c_action) from actions.js
        checkPowerRequirements(def) {
            for (let req in this.definition.power_reqs ?? {}) {
                if (!game.global.tech[req] || game.global.tech[req] < this.definition.power_reqs[req]){
                    return false;
                }
            }
            return true;
        }


        get powered() {
            if (this.overridePowered !== undefined) {
                return this.overridePowered;
            }

            if (!this.definition.hasOwnProperty("powered") || !this.checkPowerRequirements()) {
                return 0;
            }

            return this.definition.powered();
        }

        updateResourceRequirements() {
            if (!this.isUnlocked()) {
                return;
            }

            this.resourceRequirements = [];

            let adjustedCosts = poly.adjustCosts(this.definition.cost);
            for (let resourceName in adjustedCosts) {
                if (resources[resourceName]) {
                    let resourceAmount = Number(adjustedCosts[resourceName]());
                    this.resourceRequirements.push(new ResourceRequirement(resources[resourceName], resourceAmount));
                }
            }
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
         */
        click() {
            if (!this.isClickable()) {
                return false
            }

            //this.updateResourceRequirements();
            this.resourceRequirements.forEach(requirement =>
                requirement.resource.currentQuantity -= requirement.quantity
            );
            let newCount = this.count + 1;
            this.vue.action();

            if (game.global.race.species === "protoplasm" // Don't log evolution actions
                    || this === state.cityBuildings.Food // Don't log gathering actions
                    || this === state.cityBuildings.Lumber
                    || this === state.cityBuildings.Stone
                    || this === state.cityBuildings.Chrysotile
                    || this === state.cityBuildings.Slaughter
                    || this === state.cityBuildings.SlaveMarket) { // Don't log buying slaves
                return true;
            }

            if (this.gameMax > 1 && this.gameMax < Number.MAX_SAFE_INTEGER) {
                // This build has segments that will be built
                state.log.logSuccess(loggingTypes.multi_construction, `${this.title} (${newCount}) has been constructed.`);
            } else {
                state.log.logSuccess(loggingTypes.construction, `${this.title} has been constructed.`);
            }

            return true;
        }

        /**
         * @param {Resource} resource
         * @param {number} rate
         */
        addResourceConsumption(resource, rate) {
            this.consumption.push(normalizeProperties({ resource: resource, rate: rate }));
        }

        getMissingSupply() {
            let uselessSupport = 0;

            for (let j = 0; j < this.consumption.length; j++) {
                let resourceType = this.consumption[j];

                // Food fluctuate a lot, ignore it, assuming we always can get more
                if (resourceType.resource === resources.Food && settings.autoJobs && state.jobs.Farmer.isManaged()) {
                    continue;
                }

                let consumptionRate = resourceType.rate;
                // Adjust fuel
                if (this._tab === "space" && (resourceType.resource === resources.Oil || resourceType.resource === resources.Helium_3)) {
                    consumptionRate = game.fuel_adjust(consumptionRate);
                }
                if (this._tab === "interstellar" && (resourceType.resource === resources.Deuterium || resourceType.resource === resources.Helium_3) && this !== state.spaceBuildings.AlphaFusion) {
                    consumptionRate = game.int_fuel_adjust(consumptionRate);
                }

                let rateOfChange = resourceType.resource.rateOfChange;

                // It need something that we're lacking
                if (resourceType.resource.storageRatio < 0.99 && consumptionRate > 0 && rateOfChange < consumptionRate) {
                    return resourceType;
                }

                // It provides support which we don't need
                if (consumptionRate < 0 && resourceType.resource.isSupport()) {
                    let minSupport = resourceType.resource == resources.Belt_Support ? 2 : resourceType.resource == resources.Gateway_Support ? 5 : 1;
                    if (rateOfChange >= minSupport) {
                      uselessSupport += 1;
                    } else {
                      uselessSupport -= 1000;
                    }
                }

                // BeltSpaceStation is special case, as it provide jobs, which provides support, thus we can have 0 support even with powered buildings, if jobs not filled
                if (this === state.spaceBuildings.BeltSpaceStation && resourceType.resource === resources.Belt_Support && state.jobs.SpaceMiner.count < state.jobs.SpaceMiner.max){
                    return {resource: resources.Population, rate: 1};
                }
            }
            // We're checking this after loop, to make sure *all* provided supports are useless.
            // Starbase is exception here, as it house soldiers, which always useful
            if (uselessSupport > 0 && this !== state.spaceBuildings.GatewayStarbase) {
                return this.consumption[0];
            }
            return null;
        }
        //#endregion Standard actions

        //#region Buildings

        get count() {
            if (!this.isUnlocked()) {
                return 0;
            }

            return this.instance?.count ?? 0;
        }

        hasState() {
            if (!this.isUnlocked()) {
                return false;
            }

            return ((this.definition.powered && game.global.tech['high_tech'] && game.global.tech['high_tech'] >= 2 && this.checkPowerRequirements()) || (this.definition.switchable && this.definition.switchable()));
        }

        get stateOnCount() {
            if (!this.hasState() || this.count < 1) {
                return 0;
            }

            return this.instance.on;
        }

        get stateOffCount() {
            if (!this.hasState() || this.count < 1) {
                return 0;
            }

            return this.instance.count - this.instance.on;
        }

        /**
         * @param {number} adjustCount
         */
        tryAdjustState(adjustCount) {
            if (adjustCount === 0 || !this.hasState()) {
                return false;
            }

            if (adjustCount > 0) {
                state.multiplier.reset(adjustCount, this.stateOnCount + adjustCount >= this.count);
                while (state.multiplier.remainder > 0) {
                    state.multiplier.setMultiplier();
                    this.vue.power_on();
                }

                return;
            }

            if (adjustCount < 0) {
                adjustCount = adjustCount * -1; // We always want a positive number as we're calling an opposite function

                state.multiplier.reset(adjustCount, this.stateOnCount - adjustCount <= 0);
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
        832040,
        1346269,
        2178309,
        3524578,
        5702887,
        9227465,
        14930352,
        24157817,
        39088169,
        63245986,
        102334155,
        165580141,
        267914296,
        433494437,
        701408733
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
            this.priorityList.sort((a, b) => a.priority - b.priority);
            this._managedPriorityList.sort((a, b) => a.priority - b.priority);
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
         */
        buyTrait(traitName) {
            getVueById(this._traitVueBinding)?.gene(traitName);
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
            this.currentTradeDiff = 0;

            this.marketPriority = 0;
            this.autoBuyEnabled = false;
            this.autoSellEnabled = false;
            this.autoBuyRatio = -1;
            this.autoSellRatio = -1;
            this.autoTradeBuyEnabled = false;
            this.autoTradeBuyRoutes = 0;
            this.autoTradeSellEnabled = true;
            this.autoTradeSellMinPerSecond = 0;
            this.galaxyMarketWeighting = 0;
            this.galaxyMarketPriority = 0;

            this.ejectEnabled = false;

            this.storeOverflow = false;
            this.storagePriority = 0;
            this.storageRequired = 0;
            this.autoStorageEnabled = true;
            this._autoCratesMax = -1;
            this._autoContainersMax = -1;

            this.weighting = 1;
            this.preserve = 0;

            /** @type {ResourceRequirement[]} */
            this.resourceRequirements = [];

            this.currentQuantity = 0;
            this.maxQuantity = 0;
            this.rateOfChange = 0;
            this.currentCrates = 0;
            this.currentContainers = 0;
            this.currentEject = 0;
            this.currentDecay = 0;

            this.requestedQuantity = 0;

            this._vueBinding = "res" + this.id;
            this._stackVueBinding = "stack-" + this.id;
            this._ejectorVueBinding = "eject" + this.id;
            this._marketVueBinding = "market-" + this.id;
        }

        //#region Standard resource

        get instance() {
            return game.global.resource[this.id];
        }

        get id() {
            return this._id;
        }

        updateData() {
            if (!this.isUnlocked()) {
                return;
            }

            let instance = this.instance;
            this.currentQuantity = instance.amount;
            this.maxQuantity = instance.max >= 0 ? instance.max : Number.MAX_SAFE_INTEGER;
            this.rateOfChange = instance.diff;
            this.currentCrates = instance.crates;
            this.currentContainers = instance.containers;

            // When routes are managed - we're excluding trade diff from operational rate of change.
            if (settings.autoMarket && this.isTradable() && (this.autoTradeBuyEnabled || this.autoTradeSellEnabled)) {
                this.currentTradeRoutes = instance.trade;
                this.currentTradeRouteBuyPrice = game.tradeBuyPrice(this._id);
                this.currentTradeRouteSellPrice = game.tradeSellPrice(this._id);
                this.currentTradeDiff = game.breakdown.p.consume[this._id].Trade || 0;
                this.rateOfChange -= this.currentTradeDiff;
            } else {
                this.currentTradeDiff = 0;
            }

            // Exclude ejected resources, so we can reuse it
            if (settings.prestigeWhiteholeEjectEnabled && this.isEjectable() && state.spaceBuildings.BlackholeMassEjector.count > 0) {
                this.currentEject = game.global.interstellar.mass_ejector[this._id];
                this.rateOfChange += this.currentEject;
            } else {
                this.currentEject = 0;
            }

            // Restore decayed rate
            if (game.global.race['decay'] && this.tradeRouteQuantity > 0 && this.currentQuantity >= 50) {
                this.currentDecay = (this.currentQuantity - 50) * (0.001 * this.tradeRouteQuantity);
                this.rateOfChange += this.currentDecay;
            } else {
                this.currentDecay = 0;
            }
        }

        calculateRateOfChange(apply) {
            let value = this.rateOfChange;
            if ((apply.buy || apply.all) && this.currentTradeDiff > 0) {
                value += this.currentTradeDiff;
            }
            if ((apply.sell || apply.all) && this.currentTradeDiff < 0) {
                value += this.currentTradeDiff;
            }
            if (apply.eject || apply.all) {
                value -= this.currentEject;
            }
            if (apply.decay || apply.all) {
                value -= this.currentDecay;
            }

            return value;
        }

        isUnlocked() {
            return this.instance?.display;
        }

        /**
         * @param {Resource} resource
         */
        isMarketUnlocked() {
            let node = document.getElementById(this._marketVueBinding);
            return node !== null && node.style.display !== "none";
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

            this.currentEject += count;

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

            this.currentEject -= count;

            state.multiplier.reset(count, game.global.interstellar.mass_ejector[this.id] <= count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                vue.ejectLess(this.id);
            }
        }

        isSupport() {
            return false;
        }

        isTradable() {
            return game.tradeRatio.hasOwnProperty(this.id) && (this.instance ? this.instance.hasOwnProperty("trade") : false);
        }

        isCraftable() {
            return poly.craftCost().hasOwnProperty(this.id);
        }

        hasStorage() {
            return this.instance ? this.instance.stackable : false;
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

        get usefulRatio() {
            if (this.maxQuantity === 0) {
                return 0;
            }
            if (this.storageRequired === 0) {
                return 1;
            }

            return this.currentQuantity / Math.min(this.maxQuantity, this.storageRequired);
        }

        get timeToFull() {
            if (this.storageRatio > 0.98) {
                return 0; // Already full.
            }
            let totalRateOfCharge = this.calculateRateOfChange({all: true});
            if (totalRateOfCharge <= 0) {
                return Number.MAX_SAFE_INTEGER; // Won't ever fill with current rate.
            }
            return (this.maxQuantity - this.currentQuantity) / totalRateOfCharge;
        }

        get timeToRequired() {
            if (this.storageRatio > 0.98 || this.storageRequired === 0) {
                return 0; // Already full.
            }
            let totalRateOfCharge = this.calculateRateOfChange({all: true});
            if (totalRateOfCharge <= 0) {
                return Number.MAX_SAFE_INTEGER; // Won't ever fill with current rate.
            }
            return (Math.min(this.maxQuantity, this.storageRequired) - this.currentQuantity) / totalRateOfCharge;
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

        /**
         * @param {number} count
         */
        tryAssignCrate(count) {
            let vue = getVueById(this._stackVueBinding);
            if (vue === undefined) { return false; }

            state.multiplier.reset(count, count >= resources.Crates.currentQuantity);
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

            state.multiplier.reset(count, this.currentCrates - count <= 0);
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

            state.multiplier.reset(count, count >= resources.Containers.currentQuantity);
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

            state.multiplier.reset(count, this.currentContainers - count <= 0);
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
            if (game.global.race['no_craft']) { return false; }

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

        updateData() {
            if (!this.isUnlocked()) {
                return;
            }

            this.currentQuantity = game.global.city.power;
            this.maxQuantity = Number.MAX_SAFE_INTEGER;
            this.rateOfChange = game.global.city.power;
        }

        isUnlocked() {
            return game.global.city.powered;
        }
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

        updateData() {
            if (!this.isUnlocked()) {
                return;
            }

            let supportId = game.actions[this._region][this._inRegionId].info.support
            if (!supportId) {
                return;
            }

            this.currentQuantity = game.global[this._region][supportId].support;
            this.maxQuantity = game.global[this._region][supportId].s_max;
            this.rateOfChange = this.maxQuantity - this.currentQuantity;
        }

        get storageRatio() {
            if (this.maxQuantity === 0) {
                return 0;
            }

            return (this.maxQuantity - this.currentQuantity) / this.maxQuantity;
        }

        isUnlocked() {
            let containerNode = document.getElementById(this.id);
            return containerNode !== null && containerNode.style.display !== "none";
        }

        isSupport() {
            return true;
        }
    }

    class SpecialResource extends Resource {
        constructor(name, id) {
            super(name, id);
        }

        updateData() {
            if (!this.isUnlocked()) {
                return;
            }

            this.currentQuantity = this.id === "AntiPlasmid" ? game.global.race[this.id].anti : game.global.race[this.id].count;
            this.maxQuantity = Number.MAX_SAFE_INTEGER;
        }

        isUnlocked() {
            return this.currentQuantity > 0;
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

    class StarPower extends Resource {
        // This isn't really a resource but we're going to make a dummy one so that we can treat it like a resource
        constructor() {
            super("Star Power", "StarPower");
        }

        updateData() {
            if (!this.isUnlocked()) {
                return;
            }

            this.currentQuantity = game.global.city.smelter.Star;
            this.maxQuantity = game.global.city.smelter.StarCap;
            this.rateOfChange = this.maxQuantity - this.currentQuantity;
        }

        isUnlocked() {
            return game.global.tech.star_forge >= 2;
        }

    }

    class RockQuarry extends Action {
        constructor() {
            super("Rock Quarry", "city", "rock_quarry", "");

            this._industryVueBinding = "iQuarry";
            this._industryVue = undefined;
        }

        initIndustry() {
            if (this.count < 1 || !game.global.race['smoldering']) {
                return false;
            }

            this._industryVue = getVueById(this._industryVueBinding);
            if (this._industryVue === undefined) {
                return false;
            }

            return true;
        }

        get currentAsbestos() {
            return this.instance.asbestos;
        }

        increaseAsbestos(count) {
            if (count === 0) {
                return false;
            }
            if (count < 0) {
                return this.decreaseAsbestos(count * -1);
            }

            state.multiplier.reset(count, this.instance.asbestos + count >= 100);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._industryVue.add();
            }

            return true;
        }

        decreaseAsbestos(count) {
            if (count === 0) {
                return false;
            }
            if (count < 0) {
                return this.increaseAsbestos(count * -1);
            }

            state.multiplier.reset(count, this.instance.asbestos - count <= 0);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._industryVue.sub();
            }

            return true;
        }
    }

    class Smelter extends Action {
        constructor() {
            super("Smelter", "city", "smelter", "");

            this._industryVueBinding = "iSmelter";
            this._industryVue = undefined;

            this.Productions = normalizeProperties({
                Iron: {id: "Iron", unlocked: () => true, resource: resources.Iron, add: "ironSmelting", cost: []},
                Steel: {id: "Steel", unlocked: () => game.global.resource.Steel.display && game.global.tech.smelting >= 2, resource: resources.Steel, add: "steelSmelting",
                        cost: [new ResourceProductionCost(resources.Coal, 0.25, 1.25), new ResourceProductionCost(resources.Iron, 2, 6)]},
            }, [ResourceProductionCost]);

            this.Fuels = normalizeProperties({
                Oil: {id: "Oil", unlocked: () => game.global.resource.Oil.display, cost: [new ResourceProductionCost(resources.Oil, 0.35, 2)]},
                Coal: {id: "Coal", unlocked: () => game.global.resource.Coal.display, cost: [new ResourceProductionCost(resources.Coal, () => !isLumberRace() ? 0.15 : 0.25, 2)]},
                Wood: {id: "Wood", unlocked: () => isLumberRace() || game.global.race['evil'], cost: [new ResourceProductionCost(resources.Lumber, () => game.global.race['evil'] && !game.global.race['soul_eater'] ? 1 : 3, 6)]},
                Star: {id: "Star", unlocked: () => game.global.tech.star_forge >= 2, cost: [new ResourceProductionCost(resources.StarPower, 1, 0)]},
                Inferno: {id: "Inferno", unlocked: () => game.global.tech.smelting >= 8, cost: [new ResourceProductionCost(resources.Coal, 50, 50), new ResourceProductionCost(resources.Oil, 35, 50), new ResourceProductionCost(resources.Infernite, 0.5, 50)]},
            }, [ResourceProductionCost]);
        }

        initIndustry() {
            if (this.count < 1 && !game.global.race['cataclysm']) {
                return false;
            }

            this._industryVue = getVueById(this._industryVueBinding);
            if (this._industryVue === undefined) {
                return false;
            }

            return true;
        }

        fuelPriorityList() {
            return Object.values(this.Fuels).sort((a, b) => a.priority - b.priority);
        }

        fueledCount(fuel) {
            if (!fuel.unlocked) {
                return 0;
            }

            return game.global.city.smelter[fuel.id];
        }

        smeltingCount(production) {
            if (!production.unlocked) {
                return 0;
            }

            return game.global.city.smelter[production.id];
        }

        increaseFuel(fuel, count) {
            if (count === 0 || !fuel.unlocked) {
                return false;
            }
            if (count < 0) {
                return this.decreaseFuel(fuel, count * -1);
            }

            state.multiplier.reset(count, this.fueledCount(fuel) + count >= this.maxOperating);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._industryVue.addFuel(fuel.id);
            }

            return true;
        }

        decreaseFuel(fuel, count) {
            if (count === 0 || !fuel.unlocked) {
                return false;
            }
            if (count < 0) {
                return this.increaseFuel(fuel, count * -1);
            }

            state.multiplier.reset(count, this.fueledCount(fuel) - count <= 0);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._industryVue.subFuel(fuel.id);
            }

            return true;
        }

        increaseSmelting(production, count) {
            if (count === 0 || !production.unlocked) {
                return false;
            }

            state.multiplier.reset(count, this.smeltingCount(production) + count >= this.maxOperating);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._industryVue[production.add]();
            }

            return true;
        }

        get maxOperating() {
            return game.global.city.smelter.cap;
        }
    }

    function f_rate(production, resource) {
        return game.f_rate[production][resource][game.global.tech['factory'] || 0];
    }

    class Factory extends Action {
        constructor() {
            super("Factory", "city", "factory", "");

            this._industryVueBinding = "iFactory";
            this._industryVue = undefined;

            this.Productions = normalizeProperties({
                LuxuryGoods:          {id: "Lux", resource: resources.Money, unlocked: () => true,
                                       cost: [new ResourceProductionCost(resources.Furs, () => f_rate("Lux", "fur"), 5)]},
                Furs:                 {id: "Furs", resource: resources.Furs, unlocked: () => game.global.tech['synthetic_fur'],
                                       cost: [new ResourceProductionCost(resources.Money, () => f_rate("Furs", "money"), 1000),
                                              new ResourceProductionCost(resources.Polymer, () => f_rate("Furs", "polymer"), 10)]},
                Alloy:                {id: "Alloy", resource: resources.Alloy, unlocked: () => true,
                                       cost: [new ResourceProductionCost(resources.Copper, () => f_rate("Alloy", "copper"), 5),
                                              new ResourceProductionCost(resources.Aluminium, () => f_rate("Alloy", "aluminium"), 5)]},
                Polymer:              {id: "Polymer", resource: resources.Polymer, unlocked: () => game.global.tech['polymer'],
                                       cost: function(){ return !isLumberRace() ? this.cost_kk : this.cost_normal},
                                       cost_kk:       [new ResourceProductionCost(resources.Oil, () => f_rate("Polymer", "oil_kk"), 2)],
                                       cost_normal:   [new ResourceProductionCost(resources.Oil, () => f_rate("Polymer", "oil"), 2),
                                                       new ResourceProductionCost(resources.Lumber, () => f_rate("Polymer", "lumber"), 50)]},
                NanoTube:             {id: "Nano", resource: resources.Nano_Tube, unlocked: () => game.global.tech['nano'],
                                       cost: [new ResourceProductionCost(resources.Coal, () => f_rate("Nano_Tube", "coal"), 15),
                                              new ResourceProductionCost(resources.Neutronium, () => f_rate("Nano_Tube", "neutronium"), 0.2)]},
                Stanene:              {id: "Stanene", resource: resources.Stanene, unlocked: () => game.global.tech['stanene'],
                                       cost: [new ResourceProductionCost(resources.Aluminium, () => f_rate("Stanene", "aluminium"), 50),
                                              new ResourceProductionCost(resources.Nano_Tube, () => f_rate("Stanene", "nano"), 5)]},
            }, [ResourceProductionCost]);

        }

        initIndustry() {
            if (this.count < 1 && state.spaceBuildings.RedFactory.count < 1) {
                return false;
            }

            this._industryVue = getVueById(this._industryVueBinding);
            if (this._industryVue === undefined) {
                return false;
            }

            return true;
        }

        get currentOperating() {
            let total = 0;
            for (let key in this.Productions){
                let production = this.Productions[key];
                total += game.global.city.factory[production.id];
            }
            return total;
        }

        get maxOperating() {
            let max = state.cityBuildings.Factory.stateOnCount + state.spaceBuildings.RedFactory.stateOnCount + state.spaceBuildings.AlphaMegaFactory.stateOnCount * 2;
            for (let key in this.Productions){
                let production = this.Productions[key];
                if (production.unlocked && !production.enabled) {
                    max -= game.global.city.factory[production.id];
                }
            }
            return max;
        }

        currentProduction(production) {
            if (!production.unlocked) {
                return 0;
            }

            return game.global.city.factory[production.id];
        }

        increaseProduction(production, count) {
            if (count === 0 || !production.unlocked) {
                return false;
            }
            if (count < 0) {
                return this.decreaseProduction(production, count * -1);
            }

            state.multiplier.reset(count, count >= this.maxOperating);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._industryVue.addItem(production.id);
            }

            return true;
        }

        decreaseProduction(production, count) {
            if (count === 0 || !production.unlocked) {
                return false;
            }
            if (count < 0) {
                return this.increaseProduction(production, count * -1);
            }

            state.multiplier.reset(count, this.currentProduction(production) - count <= 0);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._industryVue.subItem(production.id);
            }

            return true;
        }
    }

    class MiningDroid extends Action {
        constructor() {
            super("Alpha Mining Droid", "interstellar", "mining_droid", "int_alpha");

            this._industryVueBinding = "iDroid";
            this._industryVue = undefined;

            this.Productions = {
                Adamantite: {id: "adam", resource: resources.Adamantite},
                Uranium: {id: "uran", resource: resources.Uranium},
                Coal: {id: "coal", resource: resources.Coal},
                Aluminium: {id: "alum", resource: resources.Aluminium},
            };
        }

        initIndustry() {
            if (this.count < 1) {
                return false;
            }

            this._industryVue = getVueById(this._industryVueBinding);
            if (this._industryVue === undefined) {
                return false;
            }

            return true;
        }

        get currentOperating() {
            let total = 0;
            for (let key in this.Productions){
                let production = this.Productions[key];
                total += game.global.interstellar.mining_droid[production.id];
            }
            return total;
        }

        get maxOperating() {
            return game.global.interstellar.mining_droid.on;
        }

        currentProduction(production) {
            return game.global.interstellar.mining_droid[production.id];
        }

        increaseProduction(production, count) {
            if (count === 0) {
                return false;
            }
            if (count < 0) {
                return this.decreaseProduction(production, count * -1);
            }

            state.multiplier.reset(count, count >= this.maxOperating);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._industryVue.addItem(production.id);
            }

            return true;
        }

        decreaseProduction(production, count) {
            if (count === 0) {
                return false;
            }
            if (count < 0) {
                return this.increaseProduction(production, count * -1);
            }

            state.multiplier.reset(count, this.currentProduction(production) - count <= 0);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._industryVue.subItem(production.id);
            }

            return true;
        }
    }

    class GraphenePlant extends Action {
        constructor() {
            super("Alpha Graphene Plant", "interstellar", "g_factory", "int_alpha");

            this._industryVueBinding = "iGraphene";
            this._industryVue = undefined;

            this.Fuels = {
                Lumber: {id: "Lumber", resource: resources.Lumber, quantity: 350, add: "addWood", sub: "subWood"},
                Coal: {id: "Coal", resource: resources.Coal, quantity: 25, add: "addCoal", sub: "subCoal"},
                Oil: {id: "Oil", resource: resources.Oil, quantity: 15, add: "addOil", sub: "subOil"},
            };
        }

        initIndustry() {
            if (this.count < 1) {
                return false;
            }

            this._industryVue = getVueById(this._industryVueBinding);
            if (this._industryVue === undefined) {
                return false;
            }

            return true;
        }

        fueledCount(fuel) {
            return game.global.interstellar.g_factory[fuel.id];
        }

        increaseFuel(fuel, count) {
            if (count === 0 || !fuel.resource.isUnlocked()) {
                return false;
            }
            if (count < 0) {
                return this.decreaseFuel(fuel, count * -1);
            }

            let add = this._industryVue[fuel.add];

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                add();
            }

            return true;
        }

        decreaseFuel(fuel, count) {
            if (count === 0 || !fuel.resource.isUnlocked()) {
                return false;
            }
            if (count < 0) {
                return this.increaseFuel(fuel, count * -1);
            }

            let sub = this._industryVue[fuel.sub];

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                sub();
            }

            return true;
        }
    }

    class GorddonFreighter extends Action {
        constructor() {
            super("Gorddon Freighter", "galaxy", "freighter", "gxy_gorddon", {ship: true});

            this._industryVueBinding = "galaxyTrade";
            this._industryVue = undefined;
        }

        initIndustry() {
            if (this.count < 1) {
                return false;
            }

            this._industryVue = getVueById(this._industryVueBinding);
            if (this._industryVue === undefined) {
                return false;
            }

            return true;
        }

        get currentOperating() {
            return game.global.galaxy.trade.cur;
        }

        get maxOperating() {
            return game.global.galaxy.trade.max;
        }

        currentProduction(production) {
            return game.global.galaxy.trade["f" + production];
        }

        increaseProduction(production, count) {
            if (count === 0) {
                return false;
            }
            if (count < 0) {
                return this.decreaseProduction(production, count * -1);
            }

            state.multiplier.reset(count, count >= this.maxOperating);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._industryVue.more(production);
            }

            return true;
        }

        decreaseProduction(production, count) {
            if (count === 0) {
                return false;
            }
            if (count < 0) {
                return this.increaseProduction(production, count * -1);
            }

            state.multiplier.reset(count, this.currentProduction(production) - count <= 0);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._industryVue.less(production);
            }

            return true;
        }
    }

    class SpaceDock extends Action {
        constructor() {
            super("Gas Space Dock", "space", "star_dock", "spc_gas");
        }

        isOptionsCached() {
            if (this.count < 1 || game.global.tech['genesis'] < 4) {
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
            if (this.count < 1 || state.windowManager.isOpen()) {
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
            if (this._location !== "") {
                return game.actions[this._modalTab][this._location][this._id];
            } else {
                return game.actions[this._modalTab][this._id];
            }
        }

        get instance() {
            return game.global[this._modalTab][this._id];
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
        magocracy: { id: "magocracy", name: function () { return game.loc("govern_magocracy") } },
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

            if (government === governmentTypes.magocracy.id && !game.global.tech['gov_mage']) {
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
                if (this._espionageToPerform === espionageTypes.Purchase.id) {
                    resources.Money.currentQuantity -= poly.govPrice("gov" + govIndex);
                }
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
                if (game.global.civic.foreign[govProp].spy >= 3 && resources.Money.currentQuantity >= poly.govPrice(govProp)){
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

    class ChallengeEvolutionAction extends Action {
        /**
         * @param {string} name
         * @param {string} id
         * @param {string} effectId
         */
        constructor(name, id, effectId) {
            super(name, "evolution", id, "");

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

    class WarManager {
        constructor() {
            this._garrisonVueBinding = "garrison";
            this._garrisonVue = undefined;

            this._hellVueBinding = "fort";
            this._hellVue = undefined;

            this._textArmy = "army";

            this.hellAttractorMax = 0;

            this.tactic = 0;
            this.workers = 0;
            this.wounded = 0;
            this.max = 0;
            this.raid = 0;
            this.m_use = 0;
            this.crew = 0;

            this.hellSoldiers = 0;
            this.hellPatrols = 0;
            this.hellPatrolSize = 0;
            this.hellAssigned = 0;
        }

        initGarrison() {
            if (!game.global.civic.garrison) {
                return false;
            }

            this._garrisonVue = getVueById(this._garrisonVueBinding);
            if (this._garrisonVue === undefined) {
                return false;
            }

            return true;
        }

        initHell() {
            if (!game.global.portal.fortress) {
                return false;
            }

            this._hellVue = getVueById(this._hellVueBinding);
            if (this._hellVue === undefined) {
                return false;
            }

            return true;
        }

        updateData() {
            if (game.global.civic.garrison) {
                this.tactic = game.global.civic.garrison.tactic;
                this.workers = game.global.civic.garrison.workers;
                this.wounded = game.global.civic.garrison.wounded;
                this.raid = game.global.civic.garrison.raid;
                this.max = game.global.civic.garrison.max;
                this.m_use = game.global.civic.garrison.m_use;
                this.crew = game.global.civic.garrison.crew;
            }

            if (game.global.portal.fortress) {
                this.hellSoldiers = game.global.portal.fortress.garrison;
                this.hellPatrols = game.global.portal.fortress.patrols;
                this.hellPatrolSize = game.global.portal.fortress.patrol_size;
                this.hellAssigned = game.global.portal.fortress.assigned;
            }
        }

        isForeignUnlocked() {
            return !game.global.race['cataclysm'] && !game.global.tech['world_control']
        }

        get currentSoldiers() {
            return this.workers - this.crew;
        }

        get maxSoldiers() {
            return this.max - this.crew;
        }

        get currentCityGarrison() {
            return this.currentSoldiers - this.hellSoldiers;
        }

        get maxCityGarrison() {
            return this.maxSoldiers - this.hellSoldiers;
        }

        get hellGarrison()  {
            return this.hellSoldiers - this.hellPatrolSize * this.hellPatrols - this.hellReservedSoldiers;
        }

        /**
         * @param {number} govIndex
         */
        launchCampaign(govIndex) {
            state.spyManager.updateLastAttackLoop(govIndex);
            this._garrisonVue.campaign(govIndex);

            return true;
        }

        isMercenaryUnlocked() {
            return game.global.civic.garrison.mercs;
        }

        getMercenaryCost() {
            let cost = Math.round((1.24 ** this.workers) * 75) - 50;
            if (cost > 25000){
                cost = 25000;
            }
            if (this.m_use > 0){
                cost *= 1.1 ** this.m_use;
            }
            if (game.global.race['brute']){
                let traitsBrute0 = 50;
                cost *= 1 - (traitsBrute0 / 100);
            }
            cost = Math.round(cost);

            return cost;
        }

        hireMercenary() {
            if (!this.isMercenaryUnlocked()) {
                return false;
            }

            let cost = this.getMercenaryCost();
            if (this.workers >= this.max || resources.Money.currentQuantity < cost){
                return false;
            }

            this._garrisonVue.hire();

            resources.Money.currentQuantity -= cost;
            this.workers++;
            this.m_use++;

            return true;
        }

        get hellReservedSoldiers(){
            let soldiers = 0;
            if (state.spaceBuildings.PortalSoulForge.stateOnCount > 0) {
                // export function soulForgeSoldiers() from Evolve/src/portal.js
                soldiers = Math.round(650 / game.armyRating(1, "hellArmy"));
                if (game.global.portal.gun_emplacement) {
                    soldiers -= game.global.portal.gun_emplacement.on * (game.global.tech.hell_gun >= 2 ? 2 : 1);
                    if (soldiers < 0){
                        soldiers = 0;
                    }
                }
            }

            return soldiers + state.spaceBuildings.PortalGuardPost.stateOnCount;
        }

        increaseCampaignDifficulty() {
            this._garrisonVue.next();
            this.tactic = Math.min(this.tactic + 1, 4);

            return true;
        }

        decreaseCampaignDifficulty() {
            this._garrisonVue.last();
            this.tactic = Math.max(this.tactic - 1, 0);

            return true;
        }

        getCampaignTitle(tactic) {
            return this._garrisonVue.$options.filters.tactics(tactic);
        }

        /**
         * @param {number} count
         */
        addBattalion(count) {
            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._garrisonVue.aNext();
            }

            this.raid = Math.min(this.raid + count, this.currentCityGarrison);

            return true;
        }

        /**
         * @param {number} count
         */
        removeBattalion(count) {
            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._garrisonVue.aLast();
            }

            this.raid = Math.max(this.raid - count, 0);

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
            // Getting the rating for 100 soldiers and dividing it by number of soldiers, to get more accurate value after rounding
            // If requested number is bigger than amount of healthy soldiers, returned value will be spoiled
            // To avoid that we're explicitly passing zero number of wounded soldiers as string(!)
            // "0" casts to true boolean, and overrides real amount of wounded soldiers, yet still acts as 0 in math
            let singleSoldierAttackRating = game.armyRating(100, this._textArmy, "0") / 100;
            let maxSoldiers = Math.ceil(targetRating / singleSoldierAttackRating);

            if (!game.global.race['hivemind']) {
                return maxSoldiers;
            }

            // Ok, we've done no hivemind. Hivemind is trickier because each soldier gives attack rating and a bonus to all other soldiers.
            // I'm sure there is an exact mathematical calculation for this but...
            // Just loop through and remove 1 at a time until we're under the max rating.

            // At 10 soldiers there's no hivemind bonus or malus, and the malus gets up to 50%, so start with up to 2x soldiers below 10

            maxSoldiers = this.maxSoldiers;
            if (game.armyRating(maxSoldiers, this._textArmy, "0") < targetRating) {
                return Number.MAX_SAFE_INTEGER;
            }
            while (maxSoldiers > 1 && game.armyRating(maxSoldiers - 1, this._textArmy, "0") > targetRating) {
                maxSoldiers--;
            }

            return maxSoldiers;
        }


        /**
         * @param {number} count
         */
        addHellGarrison(count) {
            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._hellVue.aNext();
            }

            this.hellSoldiers = Math.min(this.hellSoldiers + count, this.workers);
            this.hellAssigned = this.hellSoldiers;

            return true;
        }

        /**
         * @param {number} count
         */
        removeHellGarrison(count) {
            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._hellVue.aLast();
            }

            let min = this.hellPatrols * this.hellPatrolSize + this.hellReservedSoldiers;
            this.hellSoldiers = Math.max(this.hellSoldiers - count, min);
            this.hellAssigned = this.hellSoldiers;

            return true;
        }

        /**
         * @param {number} count
         */
        addHellPatrol(count) {
            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                let inc = state.multiplier.setMultiplier();
                this._hellVue.patInc();

                if (this.hellPatrols * this.hellPatrolSize < this.hellSoldiers){
                    this.hellPatrols += inc;
                    if (this.hellSoldiers < this.hellPatrols * this.hellPatrolSize){
                        this.hellPatrols = Math.floor(this.hellSoldiers / this.hellPatrolSize);
                    }
                }

            }

            return true;
        }

        /**
         * @param {number} count
         */
        removeHellPatrol(count) {
            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._hellVue.patDec();
            }

            this.hellPatrols = Math.max(this.hellPatrols - count, 0);

            return true;
        }

        /**
         * @param {number} count
         */
        addHellPatrolSize(count) {
            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                let inc = state.multiplier.setMultiplier();
                this._hellVue.patSizeInc();

                if (this.hellPatrolSize < this.hellSoldiers){
                    this.hellPatrolSize += inc;
                    if (this.hellSoldiers < this.hellPatrols * this.hellPatrolSize){
                        this.hellPatrols = Math.floor(this.hellSoldiers / this.hellPatrolSize);
                    }
                }

            }

            return true;
        }

        /**
         * @param {number} count
         */
        removeHellPatrolSize(count) {
            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._hellVue.patSizeDec();
            }

            this.hellPatrolSize = Math.max(this.hellPatrolSize - count, 1);

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
            this.priorityList.sort((a, b) => a.priority - b.priority);
            this._managedPriorityList.sort((a, b) => a.priority - b.priority);

            for (let i = 0; i < this.priorityList.length; i++) {
                this.maxJobBreakpoints = Math.max(this.maxJobBreakpoints, this.priorityList[i].breakpointMaxs.length);
            }

        }

        managedPriorityList() {
            if (this._lastLoopCounter != state.loopCounter) {
                this._managedPriorityList.length = 0; // clear array
            }

            if (this._managedPriorityList.length === 0) {
                this._lastLoopCounter = state.loopCounter;
                let evilRace = isDemonRace();

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
            return !game.global.race['no_craft'];
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


    const wrGlobalCondition = 0;
    const wrIndividualCondition = 1;
    const wrDescription = 2;
    const wrMultiplier = 3;

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
            let activeRules = weightingRules.filter(rule => rule[wrGlobalCondition]() && rule[wrMultiplier]() !== 1);

            // Iterate over buildings
            for (let i = 0; i < this.priorityList.length; i++){
                let building = this.priorityList[i];

                if (state.queuedTargets.includes(building)) {
                    building.extraDescription = "Queued building, processng...";
                    continue;
                }
                if (state.triggerTargets.includes(building)) {
                    building.extraDescription = "Active trigger, processng...";
                    continue;
                }

                // Reset old weighting and note
                building.extraDescription = "";
                building.weighting = building._weighting;

                // Apply weighting rules
                for (let j = 0; j < activeRules.length; j++) {
                    let result = activeRules[j][wrIndividualCondition](building);
                    // Rule passed
                    if (result) {
                      building.extraDescription += activeRules[j][wrDescription](result, building) + "<br>";
                      building.weighting *= activeRules[j][wrMultiplier](result);


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

            if (building.isSwitchable()) {
                this._statePriorityList.push(building);
            }
        }

        sortByPriority() {
            this.priorityList.sort((a, b) => a.priority - b.priority);
            this._managedPriorityList.sort((a, b) => a.priority - b.priority);
            this._statePriorityList.sort((a, b) => a.priority - b.priority);
            this._managedStatePriorityList.sort((a, b) => a.priority - b.priority);
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

            this.autoBuildEnabled = false;
            this._autoMax = -1;
            this.ignoreMinimumMoneySetting = false;

            /** @type {ResourceRequirement[]} */
            this.resourceRequirements = [];

            this._vueBinding = "arpa" + this.id;

            this._x1ButtonSelector = `#arpa${this.id} > div.buy > button.button.x1`;
        }

        isUnlocked() {
            return document.querySelector(this._x1ButtonSelector) !== null;
        }

        get instance() {
            return game.global.arpa[this.id];
        }

        get definition() {
            return game.actions.arpa[this.id];
        }

        get title() {
            if (this.definition !== undefined) {
                return typeof this.definition.title === 'string' ? this.definition.title : this.definition.title();
            }

            return this.name;
        }

        // This is the resource requirements for 100% of the project
        updateResourceRequirements() {
            if (!this.isUnlocked()) {
                return;
            }

            this.resourceRequirements = [];

            let adjustedCosts = poly.arpaAdjustCosts(this.definition.cost);
            for (let resourceName in adjustedCosts) {
                if (resources[resourceName]) {
                    let resourceAmount = Number(adjustedCosts[resourceName]());
                    this.resourceRequirements.push(new ResourceRequirement(resources[resourceName], resourceAmount));
                }
            }
        }

        get autoMax() {
            return this._autoMax < 0 ? Number.MAX_SAFE_INTEGER : this._autoMax;
        }

        set autoMax(value) {
            if (value < 0) value = -1;
            this._autoMax = value;
        }

        get level() {
            return this.instance?.rank ?? 0;
        }

        get progress() {
            return this.instance?.complete ?? 0;
        }

        /**
         * @param {boolean} checkBuildEnabled
         */
        tryBuild(checkBuildEnabled) {
            if ((checkBuildEnabled && !this.autoBuildEnabled) || !this.isUnlocked()) {
                return false;
            }

            //this.updateResourceRequirements();
            for (let i = 0; i < this.resourceRequirements.length; i++) {
                let res = this.resourceRequirements[i];
                let stepCost = res.quantity / 100;

                if (!this.ignoreMinimumMoneySetting && res.resource === resources.Money && stepCost > 0 && resources.Money.currentQuantity - stepCost < state.minimumMoneyAllowed) {
                    return false;
                }

                if (res.resource.currentQuantity < stepCost) {
                    return false;
                }
            }

            this.resourceRequirements.forEach(requirement =>
                requirement.resource.currentQuantity -= requirement.quantity / 100
            );

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
            this.priorityList.sort((a, b) => a.priority - b.priority);
            this._managedPriorityList.sort((a, b) => a.priority - b.priority);
        }

        managedPriorityList() {
            if (this._lastLoopCounter != state.loopCounter) {
                this._managedPriorityList.length = 0; // clear array
            }

            if (this._managedPriorityList.length === 0) {
                this._lastLoopCounter = state.loopCounter;

                for (let i = 0; i < this.priorityList.length; i++) {
                    const project = this.priorityList[i];

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

            this.multiplier = 0;
        }

        updateData() {
            if (game.global.city.market) {
                this.multiplier = game.global.city.market.qty;
            }
        }

        isUnlocked() {
            return isResearchUnlocked("market");
        }

        sortByPriority() {
            this.priorityList.sort((a, b) => a.marketPriority - b.marketPriority);
        }

        /** @param {Resource} resource */
        isBuySellUnlocked(resource) {
            return document.querySelector("#market-" + resource.id + " .order") !== null;
        }

        /**
         * @param {number} multiplier
         */
        setMultiplier(multiplier) {
            if (!this.isUnlocked()) {
                return false;
            }

            this.multiplier = Math.min(Math.max(1, multiplier), this.getMaxMultiplier());

            getVueById("market-qty").qty = this.multiplier;

            return false;
        }

        getMaxMultiplier(){
            // function tradeMax() from resources.js
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
        getUnitBuyPrice(resource) {
            if (!this.isUnlocked()) {
                return -1;
            }

            // marketItem > vBind > purchase from resources.js
            let price = game.global.resource[resource.id].value;
            if (game.global.race['arrogant']){
                let traitsArrogant0 = 10;
                price *= 1 + (traitsArrogant0 / 100);
            }
            if (game.global.race['conniving']){
                let traitsConniving0 = 5;
                price *= 1 - (traitsConniving0 / 100);
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

            // marketItem > vBind > sell from resources.js
            let divide = 4;
            if (game.global.race['merchant']){
                let traitsMerchant0 = 25;
                divide *= 1 - (traitsMerchant0 / 100);
            }
            if (game.global.race['asymmetrical']){
                let traitsAsymmetrical0 = 20;
                divide *= 1 + (traitsAsymmetrical0 / 100);
            }
            if (game.global.race['conniving']){
                let traitsConniving0 = 5;
                divide *= 1 - (traitsConniving0 / 100);
            }

            return game.global.resource[resource.id].value / divide;
        }

        /**
         * @param {Resource} resource
         */
        buy(resource) {
            let vue = getVueById(resource._marketVueBinding);
            if (vue === undefined || !resource.isUnlocked()) {
                return false;
            }

            let price = this.getUnitBuyPrice(resource) * this.multiplier;
            if (resources.Money.currentQuantity < price) {
                return false;
            }

            resources.Money.currentQuantity -= this.multiplier * this.getUnitSellPrice(resource);
            resource.currentQuantity += this.multiplier;

            vue.purchase(resource.id);
        }

        /**
         * @param {Resource} resource
         */
        sell(resource) {
            let vue = getVueById(resource._marketVueBinding);
            if (vue === undefined || !resource.isUnlocked()) {
                return false;
            }

            if (resource.currentQuantity < this.multiplier) {
                return false;
            }

            resources.Money.currentQuantity += this.multiplier * this.getUnitSellPrice(resource);
            resource.currentQuantity -= this.multiplier;

            vue.sell(resource.id);
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
        zeroTradeRoutes(resource) {
            getVueById(resource._marketVueBinding)?.zero(resource.id);
        }

        /**
         * @param {Resource} resource
         * @param {number} count
         */
        addTradeRoutes(resource, count) {
            let vue = getVueById(resource._marketVueBinding);
            if (vue === undefined || !resource.isUnlocked()) {
                return false;
            }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                vue.autoBuy(resource.id);
            }

            return true;
        }

        /**
         * @param {Resource} resource
         * @param {number} count
         */
        removeTradeRoutes(resource, count) {
            let vue = getVueById(resource._marketVueBinding);
            if (vue === undefined || !resource.isUnlocked()) {
                return false;
            }

            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                vue.autoSell(resource.id);
            }

            return true;
        }
    }

    class StorageManager {
        constructor() {
            /** @type {Resource[]} */
            this.priorityList = [];

            this._storageVueBinding = "createHead";
            this._storageVue = undefined;
        }

        initStorage() {
            if (!this.isUnlocked) {
                return false;
            }

            this._storageVue = getVueById(this._storageVueBinding);
            if (this._storageVue === undefined) {
                return false;
            }

            return true;
        }

        isUnlocked() {
            return isResearchUnlocked("containerization");
        }

        sortByPriority() {
            this.priorityList.sort((a, b) => a.storagePriority - b.storagePriority);
        }

        /**
         * @param {number} count
         */
        tryConstructCrate(count) {
            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._storageVue.crate();
            }
        }

        /**
         * @param {number} count
         */
        tryConstructContainer(count) {
            state.multiplier.reset(count);
            while (state.multiplier.remainder > 0) {
                state.multiplier.setMultiplier();
                this._storageVue.container();
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

        isGreatnessAchievementUnlocked(level) {
            return isAchievementUnlocked("genus_" + game.races[this.id].type, level);
        }
    }

    class Technology {
        constructor(id) {
            this._id = id;

            this._vueBinding = "tech-" + id;

            /** @type {ResourceRequirement[]} */
            this.resourceRequirements = [];
        }

        get id() {
            return this._id;
        }

        isUnlocked() {
            return document.querySelector("#" + this.definition.id + " > a") !== null && getVueById(this._vueBinding) !== undefined;
        }

        get definition() {
            return game.actions.tech[this._id];
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

            //this.updateResourceRequirements();
            this.resourceRequirements.forEach(requirement =>
                requirement.resource.currentQuantity -= requirement.quantity
            );

            getVueById(this._vueBinding).action();
            state.log.logSuccess(loggingTypes.research, `${techIds[this.definition.id].title} has been researched.`);
            return true;
        }

        isResearched() {
            return isResearchUnlocked(this.id);
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

            this.resourceRequirements = [];

            let adjustedCosts = poly.adjustCosts(this.definition.cost);
            for (let resourceName in adjustedCosts) {
                if (resources[resourceName]) {
                    let resourceAmount = Number(adjustedCosts[resourceName]());
                    this.resourceRequirements.push(new ResourceRequirement(resources[resourceName], resourceAmount));
                }
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
                label += `Research ${techIds[this.actionId].title}`;
            }
            if (this.actionType === "build") {
                label += `Build ${this.actionCount} ${buildingIds[this.actionId].name}`;
            }

            label += ` when `;

            // Requirements
            if (this.requirementType === "unlocked") {
                label += `${techIds[this.requirementId].title} available`;
            }
            if (this.requirementType === "researched") {
                label += `${techIds[this.requirementId].title} researched`;
            }
            if (this.requirementType === "built") {
                label += `${this.requirementCount} ${buildingIds[this.requirementId].name} built`;
            }
            return label;
        }

        get cost() {
            if (this.actionType === "research") {
                return techIds[this.actionId].definition.cost;
            }
            if (this.actionType === "build") {
                return buildingIds[this.actionId].definition.cost;
            }
            return {};
        }

        isActionPossible() {
            // check against MAX as we want to know if it is possible...
            if (this.actionType === "research") {
                return techIds[this.actionId].isUnlocked() && game.checkAffordable(techIds[this.actionId].definition, true);
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
                if (techIds[this.actionId].isResearched()) {
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
                if (techIds[this.requirementId].isUnlocked()) {
                    return true;
                }
            }
            if (this.requirementType === "researched") {
                if (techIds[this.requirementId].isResearched()) {
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
        }

        /** @param {number} requirementCount */
        updateRequirementCount(requirementCount) {
            if (requirementCount === this.requirementCount) {
                return;
            }

            this.requirementCount = requirementCount;
            this.complete = false;
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

    function getCostConflict(action) {
        for (let i = 0; i < state.queuedTargets.length; i++) {
            let otherObject = state.queuedTargets[i];

            let blockKnowledge = true;
            for (let j = 0; j < otherObject.resourceRequirements.length; j++) {
                let otherReq = otherObject.resourceRequirements[j];
                if (otherReq.resource !== resources.Knowledge && otherReq.resource.currentQuantity < otherReq.quantity) {
                    blockKnowledge = false;
                }
            }

            for (let j = 0; j < otherObject.resourceRequirements.length; j++) {
                let otherReq = otherObject.resourceRequirements[j];
                let resource = otherReq.resource;
                for (let k = 0; k < action.resourceRequirements.length; k++) {
                    let actionReq = action.resourceRequirements[k];

                    if ((resource !== resources.Knowledge || blockKnowledge) && actionReq.resource === resource && otherReq.quantity > resource.currentQuantity - actionReq.quantity) {
                        return {res: resource, target: otherObject, cause: "queue"};
                    }
                }
            }
        }

        for (let i = 0; i < state.triggerTargets.length; i++) {
            let otherObject = state.triggerTargets[i];
            // Unlike queue triggers won't be processed without respective script option enabled, no need to reserve resources for something that won't ever happen
            if (!settings.autoBuild && otherObject instanceof Action) {
                continue;
            }
            if (!settings.autoResearch && otherObject instanceof Technology) {
                continue;
            }

            let blockKnowledge = true;
            for (let j = 0; j < otherObject.resourceRequirements.length; j++) {
                let otherReq = otherObject.resourceRequirements[j];
                if (otherReq.resource !== resources.Knowledge && otherReq.resource.currentQuantity < otherReq.quantity) {
                    blockKnowledge = false;
                }
            }

            for (let j = 0; j < otherObject.resourceRequirements.length; j++) {
                let otherReq = otherObject.resourceRequirements[j];
                let resource = otherReq.resource;
                for (let k = 0; k < action.resourceRequirements.length; k++) {
                    let actionReq = action.resourceRequirements[k];

                    if ((resource !== resources.Knowledge || blockKnowledge) && actionReq.resource === resource && otherReq.quantity > resource.currentQuantity - actionReq.quantity) {
                        return {res: resource, target: otherObject, cause: "trigger"};
                    }
                }
            }
        }
        return null;
    }

    class TriggerManager {
        constructor() {
            this.priorityList = [];
            this.targetTriggers = [];
        }

        resetTargetTriggers() {
            this.targetTriggers = [];
            for (let i = 0; i < this.priorityList.length; i++) {
                let trigger = this.priorityList[i];
                trigger.updateComplete();
                if ((settings.autoResearch || trigger.actionType !== "research") && (settings.autoBuild || trigger.actionType !== "build") && !trigger.complete && trigger.areRequirementsMet() && trigger.isActionPossible() && !this.actionConflicts(trigger)) {
                    this.targetTriggers.push(trigger);
                }
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
            this.priorityList.sort((a, b) => a.priority - b.priority);
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
         * This function only checks if two triggers use the same resource, it does not check storage
         * @param {Trigger} trigger
         * @return {boolean}
         */
        actionConflicts(trigger) {
            for (let i = 0; i < this.targetTriggers.length; i++) {
                let targetTrigger = this.targetTriggers[i];

                if (Object.keys(targetTrigger.cost).some(cost => Object.keys(trigger.cost).includes(cost))) {
                    return true;
                }
            }

            return false;
        }
    }

    //#endregion Class Declarations

    //#region State and Initialisation

    // Lookup tables
    var techIds = {};
    var buildingIds = {};
    var apraIds = {};

    var weightingRules = null;

    function alwaysAllowed() {
        return true;
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

    function valdiAllowed() {
        return game.global.genes.challenge;
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
        junker: new Race("junker", "Valdi", valdiAllowed, "Challenge genes unlocked", "Euthanasia"),
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

    // All minor traits and the currently two special traits
    var minorTraits = ["tactical", "analytical", "promiscuous", "resilient", "cunning", "hardy", "ambidextrous", "industrious", "content", "fibroblast", "metallurgist", "gambler", "persuasive", "fortify", "mastery"];

    var universes = ['standard','heavy','antimatter','evil','micro','magic'];

    var planetBiomes = ["oceanic", "forest", "grassland","desert", "volcanic", "tundra", "hellscape", "eden"];
    var planetTraits = ["magnetic", "rage", "elliptical", "stormy", "toxic", "ozone", "mellow", "trashed", "flare", "unstable", "dense"];
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

    var resources = { // Resources order follow game order, and used to initialize priorities
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

        // Basic resources (can trade for these)
        Food: new Resource("Food", "Food"),
        Lumber: new Resource("Lumber", "Lumber"),
        Chrysotile: new Resource("Chrysotile", "Chrysotile"),
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

        // Advanced resources
        Deuterium: new Resource("Deuterium", "Deuterium"),
        Neutronium: new Resource("Neutronium", "Neutronium"),
        Adamantite: new Resource("Adamantite", "Adamantite"),
        Infernite: new Resource("Infernite", "Infernite"),
        Elerium: new Resource("Elerium", "Elerium"),
        Nano_Tube: new Resource("Nano Tube", "Nano_Tube"),
        Graphene: new Resource("Graphene", "Graphene"),
        Stanene: new Resource("Stanene", "Stanene"),
        Bolognium: new Resource("Bolognium", "Bolognium"),
        Vitreloy: new Resource("Vitreloy", "Vitreloy"),
        Orichalcum: new Resource("Orichalcum", "Orichalcum"),

        Genes: new Resource("Genes", "Genes"),
        Soul_Gem: new Resource("Soul Gem", "Soul_Gem"),

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

        // Prestige resources
        Plasmid: new SpecialResource("Plasmid", "Plasmid"),
        Antiplasmid: new SpecialResource("Anti-Plasmid", "AntiPlasmid"),
        Phage: new SpecialResource("Phage", "Phage"),
        Dark: new SpecialResource("Dark", "Dark"),
        Harmony: new SpecialResource("Harmony", "Harmony"),

        // Special not-really-resources-but-we'll-treat-them-like-resources resources
        Power: new Power(),
        StarPower: new StarPower(),
        Moon_Support: new Support("Moon Support", "srspc_moon", "space", "spc_moon"),
        Red_Support: new Support("Red Support", "srspc_red", "space", "spc_red"),
        Sun_Support: new Support("Sun Support", "srspc_sun", "space", "spc_sun"),
        Belt_Support: new Support("Belt Support", "srspc_belt", "space", "spc_belt"),
        Alpha_Support: new Support("Alpha Support", "srint_alpha", "interstellar", "int_alpha"),
        Nebula_Support: new Support("Nebula Support", "srint_nebula", "interstellar", "int_nebula"),
        Gateway_Support: new Support("Gateway Support", "gxy_gateway", "galaxy", "gxy_gateway"),
        Alien_Support: new Support("Alien Support", "gxy_alien2", "galaxy", "gxy_alien2"),
    }

    var state = {
        scriptingEdition: false,
        loopCounter: 1,

        lastPopulationCount: Number.MAX_SAFE_INTEGER,
        lastFarmerCount: Number.MAX_SAFE_INTEGER,

        // We need to keep them separated, as we *don't* want to click on queue targets. Game will handle that. We're just managing resources for them.
        queuedTargets: [],
        triggerTargets: [],

        log: new GameLog(),
        multiplier: useMultiplier ? new Multiplier() : new NoMultiplier(),
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
            Archaeologist: new Job("archaeologist", "Archaeologist"),

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
            Rna: new Action("RNA", "evolution", "rna", ""),
            Dna: new Action("DNA", "evolution", "dna", ""),
            Membrane: new Action("Membrane", "evolution", "membrane", ""),
            Organelles: new Action("Organelles", "evolution", "organelles", ""),
            Nucleus: new Action("Nucleus", "evolution", "nucleus", ""),
            EukaryoticCell: new Action("Eukaryotic Cell", "evolution", "eukaryotic_cell", ""),
            Mitochondria: new Action("Mitochondria", "evolution", "mitochondria", ""),

            SexualReproduction: new Action("", "evolution", "sexual_reproduction", ""),
                Phagocytosis: new Action("", "evolution", "phagocytosis", ""),
                    Multicellular: new Action("", "evolution", "multicellular", ""),
                        BilateralSymmetry: new Action("", "evolution", "bilateral_symmetry", ""),
                            Arthropods: new Action("", "evolution", "athropods", ""),
                                Sentience: new Action("", "evolution", "sentience", ""),
                                Mantis: new Action("", "evolution", "mantis", ""),
                                Scorpid: new Action("", "evolution", "scorpid", ""),
                                Antid: new Action("Antid", "evolution", "antid", ""),

                            Mammals: new Action("", "evolution", "mammals", ""),
                                Humanoid: new Action("", "evolution", "humanoid", ""),
                                    Human: new Action("", "evolution", "human", ""),
                                    Orc: new Action("", "evolution", "orc", ""),
                                    Elven: new Action("", "evolution", "elven", ""),
                                Gigantism: new Action("", "evolution", "gigantism", ""),
                                    Troll: new Action("", "evolution", "troll", ""),
                                    Ogre: new Action("", "evolution", "ogre", ""),
                                    Cyclops: new Action("", "evolution", "cyclops", ""),
                                Dwarfism: new Action("", "evolution", "dwarfism", ""),
                                    Kobold: new Action("", "evolution", "kobold", ""),
                                    Goblin: new Action("", "evolution", "goblin", ""),
                                    Gnome: new Action("", "evolution", "gnome", ""),
                                Animalism: new Action("", "evolution", "animalism", ""),
                                    Cath: new Action("", "evolution", "cath", ""),
                                    Wolven: new Action("", "evolution", "wolven", ""),
                                    Centaur: new Action("", "evolution", "centaur", ""),
                                Demonic: new Action("", "evolution", "demonic", ""), // hellscape only
                                    Balorg: new Action("", "evolution", "balorg", ""),
                                    Imp: new Action("", "evolution", "imp", ""),
                                Celestial: new Action("", "evolution", "celestial", ""), // eden only
                                    Seraph: new Action("", "evolution", "seraph", ""),
                                    Unicorn: new Action("", "evolution", "unicorn", ""),
                                Fey: new Action("", "evolution", "fey", ""), // forest only
                                    Dryad: new Action("", "evolution", "dryad", ""),
                                    Satyr: new Action("", "evolution", "satyr", ""),
                                Heat: new Action("", "evolution", "heat", ""), // volcanic only
                                    Phoenix: new Action("", "evolution", "phoenix", ""),
                                    Salamander: new Action("", "evolution", "salamander", ""),
                                Polar: new Action("", "evolution", "polar", ""), // tundra only
                                    Yeti: new Action("", "evolution", "yeti", ""),
                                    Wendigo: new Action("", "evolution", "wendigo", ""),
                                Sand: new Action("", "evolution", "sand", ""), // desert only
                                    Tuskin: new Action("", "evolution", "tuskin", ""),
                                    Kamel: new Action("", "evolution", "kamel", ""),

                            Eggshell: new Action("", "evolution", "eggshell", ""),
                                Endothermic: new Action("", "evolution", "endothermic", ""),
                                    Arraak: new Action("", "evolution", "arraak", ""),
                                    Pterodacti: new Action("", "evolution", "pterodacti", ""),
                                    Dracnid: new Action("", "evolution", "dracnid", ""),

                                Ectothermic: new Action("", "evolution", "ectothermic", ""),
                                    Tortoisan: new Action("", "evolution", "tortoisan", ""),
                                    Gecko: new Action("", "evolution", "gecko", ""),
                                    Slitheryn: new Action("", "evolution", "slitheryn", ""),

                            Aquatic: new Action("", "evolution", "aquatic", ""), // ocean only
                                Sharkin: new Action("", "evolution", "sharkin", ""),
                                Octigoran: new Action("", "evolution", "octigoran", ""),

                Custom: new Action("", "evolution", "custom", ""),

                Chloroplasts: new Action("", "evolution", "chloroplasts", ""),
                    //Multicellular: new Action("", "evolution", "multicellular", ""),
                        Poikilohydric: new Action("", "evolution", "poikilohydric", ""),
                            Bryophyte: new Action("", "evolution", "bryophyte", ""),
                                Entish: new Action("", "evolution", "entish", ""),
                                Cacti: new Action("", "evolution", "cacti", ""),
                                Pinguicula: new Action("", "evolution", "pinguicula", ""),


                Chitin: new Action("", "evolution", "chitin", ""),
                    //Multicellular: new Action("", "evolution", "multicellular", ""),
                        Spores: new Action("", "evolution", "spores", ""),
                            //Bryophyte: new Action("", "evolution", "bryophyte", ""),
                                Sporgar: new Action("", "evolution", "sporgar", ""),
                                Shroomi: new Action("", "evolution", "shroomi", ""),
                                Moldling: new Action("", "evolution", "moldling", ""),


            Bunker: new ChallengeEvolutionAction("", "bunker", ""),
            Plasmid: new ChallengeEvolutionAction("Plasmid", "plasmid", "no_plasmid"),
            Trade: new ChallengeEvolutionAction("Trade", "trade", "no_trade"),
            Craft: new ChallengeEvolutionAction("Craft", "craft", "no_craft"),
            Crispr: new ChallengeEvolutionAction("Crispr", "crispr", "no_crispr"),
            Mastery: new ChallengeEvolutionAction("Mastery", "mastery", "weak_mastery"),
            Joyless: new ChallengeEvolutionAction("Joyless", "joyless", "joyless"),
            Decay: new ChallengeEvolutionAction("Decay", "decay", "decay"),
            Junker: new ChallengeEvolutionAction("Junker", "junker", "junker"),
            Steelen: new ChallengeEvolutionAction("Steelen", "steelen", "steelen"),
            EmField: new ChallengeEvolutionAction("EM Field", "emfield", "emfield"),
            Cataclysm: new ChallengeEvolutionAction("Cataclysm", "cataclysm", "cataclysm"),

        },

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
            Chrysotile: new Action("Chrysotile", "city", "chrysotile", ""),

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
            RockQuarry: new RockQuarry(), // has options
            CementPlant: new Action("Cement Plant", "city", "cement_plant", ""),
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
            MoonMission: new Action("Moon Launch", "space", "moon_mission", "spc_moon", {mission: true}),
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
            GasSpaceDock: new SpaceDock(),
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
            AlphaMiningDroid: new MiningDroid(),
            AlphaProcessing: new Action("Alpha Processing", "interstellar", "processing", "int_alpha"),
            AlphaFusion: new Action("Alpha Fusion", "interstellar", "fusion", "int_alpha"),
            AlphaLaboratory: new Action("Alpha Laboratory", "interstellar", "laboratory", "int_alpha", {knowledge: true}),
            AlphaExchange: new Action("Alpha Exchange", "interstellar", "exchange", "int_alpha"),
            AlphaFactory: new GraphenePlant(),
            AlphaWarehouse: new Action("Alpha Warehouse", "interstellar", "warehouse", "int_alpha"),
            AlphaMegaFactory: new Action("Alpha Mega Factory", "interstellar", "int_factory", "int_alpha"),
            AlphaLuxuryCondo: new Action("Alpha Luxury Condo", "interstellar", "luxury_condo", "int_alpha", {housing: true}),
            AlphaExoticZoo: new Action("Alpha Exotic Zoo", "interstellar", "zoo", "int_alpha"),

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
            BlackholeFarReach: new Action("Blackhole Farpoint", "interstellar", "far_reach", "int_blackhole", {knowledge: true}),
            BlackholeStellarEngine: new Action("Blackhole Stellar Engine", "interstellar", "stellar_engine", "int_blackhole"),
            BlackholeMassEjector: new Action("Blackhole Mass Ejector", "interstellar", "mass_ejector", "int_blackhole"),

            BlackholeJumpShip: new Action("Blackhole Jump Ship", "interstellar", "jump_ship", "int_blackhole"),
            BlackholeWormholeMission: new Action("Blackhole Wormhole Mission", "interstellar", "wormhole_mission", "int_blackhole"),
            BlackholeStargate: new Action("Blackhole Stargate", "interstellar", "stargate", "int_blackhole"),
            BlackholeCompletedStargate: new Action("Blackhole Completed Stargate", "interstellar", "s_gate", "int_blackhole"),

            SiriusMission: new Action("Sirius Mission", "interstellar", "sirius_mission", "int_sirius", {mission: true}),
            SiriusAnalysis: new Action("Sirius B Analysis", "interstellar", "sirius_b", "int_sirius", {mission: true}),
            SiriusSpaceElevator: new Action("Sirius Space Elevator", "interstellar", "space_elevator", "int_sirius"),
            SiriusGravityDome: new Action("Sirius Gravity Dome", "interstellar", "gravity_dome", "int_sirius"),
            SiriusAscensionMachine: new Action("Sirius Ascension Machine", "interstellar", "ascension_machine", "int_sirius"),
            SiriusAscensionTrigger: new Action("Sirius Ascension Trigger", "interstellar", "ascension_trigger", "int_sirius"),
            SiriusAscend: new Action("Sirius Ascend", "interstellar", "ascend", "int_sirius"),
            SiriusThermalCollector: new Action("Sirius Thermal Collector", "interstellar", "thermal_collector", "int_sirius"),

            GatewayMission: new Action("Gateway Mission", "galaxy", "gateway_mission", "gxy_gateway", {mission: true}),
            GatewayStarbase: new Action("Gateway Starbase", "galaxy", "starbase", "gxy_gateway", {garrison: true}),
            GatewayShipDock: new Action("Gateway Ship Dock", "galaxy", "ship_dock", "gxy_gateway"),

            BologniumShip: new Action("Gateway Bolognium Ship", "galaxy", "bolognium_ship", "gxy_gateway", {ship: true}),
            ScoutShip: new Action("Gateway Scout Ship", "galaxy", "scout_ship", "gxy_gateway", {ship: true}),
            CorvetteShip: new Action("Gateway Corvette Ship", "galaxy", "corvette_ship", "gxy_gateway", {ship: true}),
            FrigateShip: new Action("Gateway Frigate Ship", "galaxy", "frigate_ship", "gxy_gateway", {ship: true}),
            CruiserShip: new Action("Gateway Cruiser Ship", "galaxy", "cruiser_ship", "gxy_gateway", {ship: true}),
            Dreadnought: new Action("Gateway Dreadnought", "galaxy", "dreadnought", "gxy_gateway", {ship: true}),

            StargateStation: new Action("Stargate Station", "galaxy", "gateway_station", "gxy_stargate"),
            StargateTelemetryBeacon: new Action("Stargate Telemetry Beacon", "galaxy", "telemetry_beacon", "gxy_stargate", {knowledge: true}),
            StargateDepot: new Action("Stargate Depot", "galaxy", "gateway_depot", "gxy_stargate"),
            StargateDefensePlatform: new Action("Stargate Defense Platform", "galaxy", "defense_platform", "gxy_stargate"),

            GorddonMission: new Action("Gorddon Mission", "galaxy", "gorddon_mission", "gxy_gorddon", {mission: true}),
            GorddonEmbassy: new Action("Gorddon Embassy", "galaxy", "embassy", "gxy_gorddon", {housing: true}),
            GorddonDormitory: new Action("Gorddon Dormitory", "galaxy", "dormitory", "gxy_gorddon", {housing: true}),
            GorddonSymposium: new Action("Gorddon Symposium", "galaxy", "symposium", "gxy_gorddon", {knowledge: true}),
            GorddonFreighter: new GorddonFreighter(),

            Alien1Consulate: new Action("Alien 1 Consulate", "galaxy", "consulate", "gxy_alien1", {housing: true}),
            Alien1Resort: new Action("Alien 1 Resort", "galaxy", "resort", "gxy_alien1"),
            Alien1VitreloyPlant: new Action("Alien 1 Vitreloy Plant", "galaxy", "vitreloy_plant", "gxy_alien1"),
            Alien1SuperFreighter: new Action("Alien 1 Super Freighter", "galaxy", "super_freighter", "gxy_alien1", {ship: true}),

            Alien2Mission: new Action("Alien 2 Mission", "galaxy", "alien2_mission", "gxy_alien2", {mission: true}),
            Alien2Foothold: new Action("Alien 2 Foothold", "galaxy", "foothold", "gxy_alien2"),
            Alien2ArmedMiner: new Action("Alien 2 Armed Miner", "galaxy", "armed_miner", "gxy_alien2", {ship: true}),
            Alien2OreProcessor: new Action("Alien 2 Ore Processor", "galaxy", "ore_processor", "gxy_alien2"),
            Alien2Scavenger: new Action("Alien 2 Scavenger", "galaxy", "scavenger", "gxy_alien2", {knowledge: true, ship: true}),

            ChthonianMission: new Action("Chthonian Mission", "galaxy", "chthonian_mission", "gxy_chthonian", {mission: true}),
            ChthonianMineLayer: new Action("Chthonian Mine Layer", "galaxy", "minelayer", "gxy_chthonian", {ship: true}),
            ChthonianExcavator: new Action("Chthonian Excavator", "galaxy", "excavator", "gxy_chthonian"),
            ChthonianRaider: new Action("Chthonian Raider", "galaxy", "raider", "gxy_chthonian", {ship: true}),

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

            PortalSurveyRuins: new Action("Portal Survey Ruins", "portal", "ruins_mission", "prtl_ruins", {mission: true}),
            PortalGuardPost: new Action("Portal Guard Post", "portal", "guard_post", "prtl_ruins"),
            PortalVault: new Action("Portal Vault", "portal", "vault", "prtl_ruins"),
            PortalArchaeology: new Action("Portal Archaeology", "portal", "archaeology", "prtl_ruins"),
            PortalArcology: new Action("Portal Arcology", "portal", "arcology", "prtl_ruins"),
            PortalHellForge: new Action("Portal Infernal Forge", "portal", "hell_forge", "prtl_ruins"),
            PortalInfernoPower: new Action("Portal Inferno Reactor", "portal", "inferno_power", "prtl_ruins"),
            PortalAncientPillars: new Action("Portal Ancient Pillars", "portal", "ancient_pillars", "prtl_ruins"),
            PortalEastTower: new Action("Portal East Tower", "portal", "east_tower", "prtl_gate"),
            PortalWestTower: new Action("Portal West Tower", "portal", "west_tower", "prtl_gate"),
            PortalGateTurret: new Action("Portal Gate Turret", "portal", "gate_turret", "prtl_gate"),
            PortalInferniteMine: new Action("Portal Infernite Mine", "portal", "infernite_mine", "prtl_gate"),
        },

        projects: {
            LaunchFacility: new Project("Launch Facility", "launch_facility"),
            SuperCollider: new Project("Supercollider", "lhc"),
            StockExchange: new Project("Stock Exchange", "stock_exchange"),
            Monument: new Project("Monument", "monument"),
            Railway: new Project("Railway", "railway"),
            Nexus: new Project("Nexus", "nexus"),
            RoidEject: new Project("Asteroid Redirect", "roid_eject"),
        },
    };

    function initialiseState() {
        // Construct craftable resource list
        for (let [name, costs] of Object.entries(poly.craftCost())) {
            for (let i = 0; i < costs.length; i++) {
                resources[name].resourceRequirements.push(new ResourceRequirement(resources[costs[i].r], costs[i].a));
            }
            state.craftableResourceList.push(resources[name]);
        }
        // TODO: Craft costs aren't constant. They can change if player mutate out of wasteful. But original game expose static objects, we'd need to refresh page to get actual data.

        // Lets set our crate / container resource requirements
        resources.Crates.resourceRequirements = normalizeProperties([() => isLumberRace() ? {resource: resources.Plywood, quantity: 10} : {resource: resources.Stone, quantity: 200}]);
        resources.Containers.resourceRequirements.push(new ResourceRequirement(resources.Steel, 125));

        state.jobManager.addCraftingJob(state.jobs.Scarletite); // Scarletite should be on top
        state.jobManager.addCraftingJob(state.jobs.Plywood);
        state.jobManager.addCraftingJob(state.jobs.Brick);
        state.jobManager.addCraftingJob(state.jobs.WroughtIron);
        state.jobManager.addCraftingJob(state.jobs.SheetMetal);
        state.jobManager.addCraftingJob(state.jobs.Mythril);
        state.jobManager.addCraftingJob(state.jobs.Aerogel);
        state.jobManager.addCraftingJob(state.jobs.Nanoweave);

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
        state.spaceBuildings.PortalEastTower.gameMax = 1;
        state.spaceBuildings.PortalWestTower.gameMax = 1;
        state.spaceBuildings.PortalVault.gameMax = 2;
        state.spaceBuildings.GorddonEmbassy.gameMax = 1;
        state.spaceBuildings.Alien1Consulate.gameMax = 1;

        state.cityBuildings.CoalPower.addResourceConsumption(() => game.global.race.universe === "magic" ? resources.Mana : resources.Coal, () => game.global.race['environmentalist'] ? 0 : game.global.race.universe === "magic" ? 0.05 : 0.65);
        state.cityBuildings.OilPower.addResourceConsumption(resources.Oil, () => game.global.race['environmentalist'] ? 0 : 0.65);
        state.cityBuildings.FissionPower.addResourceConsumption(resources.Uranium, 0.1);
        state.cityBuildings.TouristCenter.addResourceConsumption(resources.Food, 50);

        // Construct space buildings list
        state.spaceBuildings.SpaceNavBeacon.addResourceConsumption(resources.Moon_Support, -1);
        state.spaceBuildings.SpaceNavBeacon.addResourceConsumption(resources.Red_Support, () => game.global.tech.luna >= 3 ? -1 : 0);
        state.spaceBuildings.MoonBase.addResourceConsumption(resources.Moon_Support, -2);
        state.spaceBuildings.MoonBase.addResourceConsumption(resources.Oil, 2);
        state.spaceBuildings.MoonIridiumMine.addResourceConsumption(resources.Moon_Support, 1);
        state.spaceBuildings.MoonHeliumMine.addResourceConsumption(resources.Moon_Support, 1);
        state.spaceBuildings.MoonObservatory.addResourceConsumption(resources.Moon_Support, 1);
        state.spaceBuildings.RedSpaceport.addResourceConsumption(resources.Red_Support, () => game.actions.space.spc_red.spaceport.support() * -1);
        state.spaceBuildings.RedSpaceport.addResourceConsumption(resources.Helium_3, 1.25);
        state.spaceBuildings.RedSpaceport.addResourceConsumption(resources.Food, () => game.global.race['cataclysm'] ? 2 : 25);
        state.spaceBuildings.RedTower.addResourceConsumption(resources.Red_Support, () => game.global.race['cataclysm'] ? -2 : -1);
        state.spaceBuildings.RedLivingQuarters.addResourceConsumption(resources.Red_Support, 1);
        state.spaceBuildings.RedMine.addResourceConsumption(resources.Red_Support, 1);
        state.spaceBuildings.RedFabrication.addResourceConsumption(resources.Red_Support, 1);
        state.spaceBuildings.RedFactory.addResourceConsumption(resources.Helium_3, 1);
        state.spaceBuildings.RedBiodome.addResourceConsumption(resources.Red_Support, 1);
        state.spaceBuildings.RedExoticLab.addResourceConsumption(resources.Red_Support, 1);
        state.spaceBuildings.RedSpaceBarracks.addResourceConsumption(resources.Oil, 2);
        state.spaceBuildings.RedSpaceBarracks.addResourceConsumption(resources.Food, () => game.global.race['cataclysm'] ? 0 : 10);
        state.spaceBuildings.RedVrCenter.addResourceConsumption(resources.Red_Support, 1);
        state.spaceBuildings.HellGeothermal.addResourceConsumption(resources.Helium_3, 0.5);
        state.spaceBuildings.SunSwarmControl.addResourceConsumption(resources.Sun_Support, -4);
        state.spaceBuildings.SunSwarmSatellite.addResourceConsumption(resources.Sun_Support, 1);
        state.spaceBuildings.GasMoonOutpost.addResourceConsumption(resources.Oil, 2);
        state.spaceBuildings.BeltSpaceStation.addResourceConsumption(resources.Belt_Support, -3);
        state.spaceBuildings.BeltSpaceStation.addResourceConsumption(resources.Food, () => game.global.race['cataclysm'] ? 1 : 10);
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
        state.spaceBuildings.AlphaExoticZoo.addResourceConsumption(resources.Alpha_Support, 1);
        state.spaceBuildings.AlphaExoticZoo.addResourceConsumption(resources.Food, 12000);
        state.spaceBuildings.AlphaMegaFactory.addResourceConsumption(resources.Deuterium, 5);

        state.spaceBuildings.ProximaTransferStation.addResourceConsumption(resources.Alpha_Support, -1);
        state.spaceBuildings.ProximaTransferStation.addResourceConsumption(resources.Uranium, 0.28);
        state.spaceBuildings.ProximaCruiser.addResourceConsumption(resources.Helium_3, 6);

        state.spaceBuildings.NebulaNexus.addResourceConsumption(resources.Nebula_Support, -2);
        state.spaceBuildings.NebulaHarvestor.addResourceConsumption(resources.Nebula_Support, 1);
        state.spaceBuildings.NebulaEleriumProspector.addResourceConsumption(resources.Nebula_Support, 1);

        state.spaceBuildings.NeutronMiner.addResourceConsumption(resources.Helium_3, 3);

        state.spaceBuildings.GatewayStarbase.addResourceConsumption(resources.Gateway_Support, -2);
        state.spaceBuildings.GatewayStarbase.addResourceConsumption(resources.Helium_3, 25);
        state.spaceBuildings.GatewayStarbase.addResourceConsumption(resources.Food, 250);
        state.spaceBuildings.GatewayShipDock.addResourceConsumption(resources.Gateway_Support, () => state.spaceBuildings.GatewayStarbase.stateOnCount * -0.25);

        state.spaceBuildings.BologniumShip.addResourceConsumption(resources.Gateway_Support, 1);
        state.spaceBuildings.BologniumShip.addResourceConsumption(resources.Helium_3, 5);
        state.spaceBuildings.ScoutShip.addResourceConsumption(resources.Gateway_Support, 1);
        state.spaceBuildings.ScoutShip.addResourceConsumption(resources.Helium_3, 6);
        state.spaceBuildings.CorvetteShip.addResourceConsumption(resources.Gateway_Support, 1);
        state.spaceBuildings.CorvetteShip.addResourceConsumption(resources.Helium_3, 10);
        state.spaceBuildings.FrigateShip.addResourceConsumption(resources.Gateway_Support, 2);
        state.spaceBuildings.FrigateShip.addResourceConsumption(resources.Helium_3, 25);
        state.spaceBuildings.CruiserShip.addResourceConsumption(resources.Gateway_Support, 3);
        state.spaceBuildings.CruiserShip.addResourceConsumption(resources.Deuterium, 25);
        state.spaceBuildings.Dreadnought.addResourceConsumption(resources.Gateway_Support, 5);
        state.spaceBuildings.Dreadnought.addResourceConsumption(resources.Deuterium, 80);

        state.spaceBuildings.StargateStation.addResourceConsumption(resources.Gateway_Support, -0.5);
        state.spaceBuildings.StargateTelemetryBeacon.addResourceConsumption(resources.Gateway_Support, -0.75);

        state.spaceBuildings.GorddonEmbassy.addResourceConsumption(resources.Food, 7500);
        state.spaceBuildings.GorddonFreighter.addResourceConsumption(resources.Helium_3, 12);

        state.spaceBuildings.Alien1VitreloyPlant.addResourceConsumption(resources.Bolognium, 2.5);
        state.spaceBuildings.Alien1VitreloyPlant.addResourceConsumption(resources.Stanene, 1000);
        state.spaceBuildings.Alien1VitreloyPlant.addResourceConsumption(resources.Money, 50000);
        state.spaceBuildings.Alien1SuperFreighter.addResourceConsumption(resources.Helium_3, 25);

        state.spaceBuildings.Alien2Foothold.addResourceConsumption(resources.Alien_Support, -4);
        state.spaceBuildings.Alien2Foothold.addResourceConsumption(resources.Elerium, 2.5);
        state.spaceBuildings.Alien2ArmedMiner.addResourceConsumption(resources.Alien_Support, 1);
        state.spaceBuildings.Alien2ArmedMiner.addResourceConsumption(resources.Helium_3, 10);
        state.spaceBuildings.Alien2OreProcessor.addResourceConsumption(resources.Alien_Support, 1);
        state.spaceBuildings.Alien2Scavenger.addResourceConsumption(resources.Alien_Support, 1);
        state.spaceBuildings.Alien2Scavenger.addResourceConsumption(resources.Helium_3, 12);

        state.spaceBuildings.ChthonianMineLayer.addResourceConsumption(resources.Helium_3, 8);
        state.spaceBuildings.ChthonianRaider.addResourceConsumption(resources.Helium_3, 18);

        state.spaceBuildings.PortalInfernoPower.addResourceConsumption(resources.Infernite, 5);
        state.spaceBuildings.PortalInfernoPower.addResourceConsumption(resources.Coal, 100);
        state.spaceBuildings.PortalInfernoPower.addResourceConsumption(resources.Oil, 80);

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
        resetEjectorState();
        resetStorageState();
        resetProjectState();
        resetProductionState();
        resetBuildingState();
        resetMinorTraitState();

        // These are buildings which are specified as powered in the actions definition game code but aren't actually powered in the main.js powered calculations
        state.buildingManager.priorityList.forEach(building => {
            if (building.powered > 0) {
                let powerId = (building._location || building._tab) + ":" + building.id;
                if (game.global.power.indexOf(powerId) === -1) {
                    building.overridePowered = 0;
                }
            }
        });
        state.cityBuildings.Windmill.overridePowered = -1;
        state.spaceBuildings.SunSwarmSatellite.overridePowered = -0.35;
        state.spaceBuildings.ProximaDyson.overridePowered = -1.25;
        state.spaceBuildings.ProximaDysonSphere.overridePowered = -5;
        state.spaceBuildings.ProximaOrichalcumSphere.overridePowered = -8;
        // Numbers aren't exactly correct. That's fine - it won't mess with calculations - it's not something we can turn off and on. We just need to know that they *are* power generators, for autobuild, and that's enough for us.
        // And it doesn't includes Stellar Engine at all. It can generate some power... But only when fully built, and you don't want to build 100 levels of engine just to generate 20MW.
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
        raceGroup = [ races.human, races.orc, races.elven ];
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

        races.junker.evolutionTree = [e.Bunker, e.Junker, e.Sentience].concat(humanoid); // Actions order is reversed, to make sure it won't Sentience before setting challenge
        raceGroup = [ races.junker ];
        state.raceGroupAchievementList.push(raceGroup);

    }

    function resetWarSettings() {
        settings.foreignAttackLivingSoldiersPercent = 90;
        settings.foreignAttackHealthySoldiersPercent = 90;
        settings.foreignHireMercMoneyStoragePercent = 90;
        settings.foreignHireMercCostLowerThan = 50000;
        settings.foreignMinAdvantage = 40;
        settings.foreignMaxAdvantage = 50;
        settings.foreignMaxSiegeBattalion = 15;

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
        settings.triggerRequest = true;
        settings.queueRequest = true;
        settings.researchRequest = true;
        settings.missionRequest = true;
        settings.genesAssembleGeneAlways = false;
        settings.buildingAlwaysClick = false;
        settings.buildingClickPerTick = 50;
    }

    function resetPrestigeSettings() {
        settings.prestigeType = "none";

        settings.prestigeMADIgnoreArpa = true;
        settings.prestigeMADWait = true;
        settings.prestigeBioseedConstruct = true;
        settings.prestigeBioseedProbes = 3;
        settings.prestigeWhiteholeMinMass = 8;
        settings.prestigeWhiteholeStabiliseMass = true;
        settings.prestigeWhiteholeEjectEnabled = true;
        settings.prestigeWhiteholeEjectExcess = false;
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
        settings.researchAlienGift = true;
    }

    function resetMarketState() {
        let defaultState = {autoBuyEnabled: false, autoBuyRatio: 0.5, autoSellEnabled: false, autoSellRatio: 0.9, autoTradeBuyEnabled: false, autoTradeBuyRoutes: 1000, autoTradeSellEnabled: true, autoTradeSellMinPerSecond: 0};
        let defaultStateBuy = {autoBuyRatio: 0.8, autoTradeBuyEnabled: true};

        let priorityList = Object.values(resources).filter(r => r.isTradable()).reverse();
        for (let [index, resource] of priorityList.entries()) {
            Object.assign(resource, defaultState);
            resource.marketPriority = index;
        }

        Object.assign(resources.Iridium, defaultStateBuy);
        Object.assign(resources.Polymer, defaultStateBuy);
        Object.assign(resources.Alloy, defaultStateBuy);
        Object.assign(resources.Titanium, defaultStateBuy);

        state.marketManager.priorityList = priorityList;

        for (let i = 0; i < poly.galaxyOffers.length; i++) {
            let resource = resources[poly.galaxyOffers[i].buy.res];
            resource.galaxyMarketWeighting = 1;
            resource.galaxyMarketPriority = i+1;
        }
    }

    function resetMarketSettings() {
        settings.tradeRouteMinimumMoneyPerSecond = 300;
        settings.tradeRouteMinimumMoneyPercentage = 50;
    }

    function resetStorageState() {
        let defaultState = {autoStorageEnabled: true, storeOverflow: false, _autoCratesMax: -1, autoContainersMax: -1};

        let priorityList = Object.values(resources).filter(r => r.hasStorage()).reverse();
        for (let [index, resource] of priorityList.entries()) {
            Object.assign(resource, defaultState);
            resource.storagePriority = index;
        }
        resources.Orichalcum.storeOverflow = true;
        resources.Vitreloy.storeOverflow = true;
        resources.Bolognium.storeOverflow = true;

        state.storageManager.priorityList = priorityList;
    }

    function resetStorageSettings() {
        settings.storageLimitPreMad = true;
        settings.storageSafeReassign = true;
    }

    function resetMinorTraitState() {
        state.minorTraitManager.clearPriorityList();

        for (let i = 0; i < minorTraits.length; i++){
            let trait = new MinorTrait(minorTraits[i]);
            trait.autoMinorTraitEnabled = true;
            trait.autoMinorTraitWeighting = 1;

            state.minorTraitManager.addMinorTraitToPriorityList(trait);
        }
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
        state.jobManager.addJobToPriorityList(state.jobs.Archaeologist);
        state.jobManager.addJobToPriorityList(state.jobs.Lumberjack);
        state.jobManager.addJobToPriorityList(state.jobs.QuarryWorker);
        state.jobManager.addJobToPriorityList(state.jobs.CrystalMiner);
        state.jobManager.addJobToPriorityList(state.jobs.Scavenger);
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
        state.jobs.Priest.breakpointMaxs = [0, 0, -1];
        state.jobs.Archaeologist.breakpointMaxs = [0, 0, -1];
    }

    function resetWeightingSettings() {
        settings.buildingWeightingNew = 3;
        settings.buildingWeightingUselessPowerPlant = 0.01;
        settings.buildingWeightingNeedfulPowerPlant = 3;
        settings.buildingWeightingUnderpowered = 0.8;
        settings.buildingWeightingUselessKnowledge = 0.01;
        settings.buildingWeightingNeedfulKnowledge = 5;
        settings.buildingWeightingUnusedEjectors = 0.1;
        settings.buildingWeightingMADUseless = 0;
        settings.buildingWeightingCrateUseless = 0.01;
        settings.buildingWeightingMissingFuel = 10;
        settings.buildingWeightingNonOperatingCity = 0.2;
        settings.buildingWeightingNonOperating = 0;
        settings.buildingWeightingTriggerConflict = 0;
        settings.buildingWeightingMissingSupply = 0;
    }

    function resetBuildingSettings() {
        settings.buildingBuildIfStorageFull = false;
        settings.buildingShrineType = "know";

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

        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Windmill);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Mill);

        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.CoalPower);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.OilPower);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.FissionPower);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalInfernoPower);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalArcology);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Apartment);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Barracks);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.TouristCenter);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.University);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Smelter);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Temple);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.OilWell);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.StorageYard);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Warehouse);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Bank);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Hospital);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.BootCamp);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.House);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Cottage);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Farm);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Silo);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Shed);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.LumberYard);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Foundry);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.OilDepot);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Trade);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Amphitheatre);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Library);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Wharf);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Lodge); // Carnivore/Detritivore/Soul Eater trait
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Smokehouse); // Carnivore trait
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.SoulWell); // Soul Eater trait
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.SlavePen); // Slaver trait
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.SlaveMarket); // Slaver trait
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Graveyard); // Evil trait
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Shrine); // Magnificent trait
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.CompostHeap); // Detritivore trait
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Pylon); // Magic Universe only
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.SacrificialAltar); // Cannibalize trait

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.DwarfMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.DwarfEleriumReactor);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.DwarfWorldCollider);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.HellMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.HellGeothermal);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.HellSwarmPlant);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ProximaTransferStation);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ProximaMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ProximaCargoYard);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ProximaCruiser);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ProximaDyson);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ProximaDysonSphere);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ProximaOrichalcumSphere);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaStarport);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaFusion);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaHabitat);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaLuxuryCondo);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaMiningDroid);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaProcessing);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaLaboratory);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaMegaFactory);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaExoticZoo);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaExchange);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaFactory);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.AlphaWarehouse);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SpaceTestLaunch);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SpaceSatellite);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SpaceGps);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SpacePropellantDepot);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SpaceNavBeacon);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedTower);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedSpaceport);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedLivingQuarters);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedBiodome);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedSpaceBarracks);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedExoticLab);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedFabrication);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedMine);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedVrCenter);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedZiggurat);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedGarage);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.MoonMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.MoonBase);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.MoonObservatory);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.MoonHeliumMine);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.MoonIridiumMine);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SunMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SunSwarmControl);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SunSwarmSatellite);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasStorage);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasSpaceDock);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasSpaceDockProbe);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasSpaceDockShipSegment);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasMoonMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasMoonDrone);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.Blackhole);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BlackholeStellarEngine);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BlackholeJumpShip);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BlackholeWormholeMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BlackholeStargate);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusAnalysis);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusSpaceElevator);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusGravityDome);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusThermalCollector);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusAscensionMachine);
        //state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusAscend); // This is performing the actual ascension. We'll deal with this in prestige automation

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BlackholeCompletedStargate); // Should be powered before Andromeda

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GatewayMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GatewayStarbase);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GatewayShipDock);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.StargateStation);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.StargateTelemetryBeacon);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.Dreadnought);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.CruiserShip);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.FrigateShip);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BologniumShip);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.CorvetteShip);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ScoutShip);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GorddonMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GorddonEmbassy);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GorddonDormitory);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GorddonSymposium);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GorddonFreighter);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.SiriusAscensionTrigger); // This is the 10,000 power one, buildings below this one should be safe to underpower for ascension. Buildings above this either provides, or support population
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BlackholeMassEjector); // Top priority of safe buildings, disable *only* for ascension, otherwise we want to have them on at any cost, to keep pumping black hole

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.Alien1Consulate);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.Alien1Resort);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.Alien1VitreloyPlant);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.Alien1SuperFreighter);

        //state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.Alien2Mission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.Alien2Foothold);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.Alien2Scavenger);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.Alien2ArmedMiner);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.Alien2OreProcessor);

        //state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ChthonianMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ChthonianMineLayer);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ChthonianExcavator);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.ChthonianRaider);

        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Wardenclyffe);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.BioLab);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.DwarfWorldController);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BlackholeFarReach);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NebulaMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NebulaNexus);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NebulaHarvestor);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NebulaEleriumProspector);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BeltMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BeltSpaceStation);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BeltEleriumShip);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BeltIridiumShip);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.BeltIronShip);

        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.CementPlant);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Factory);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasMoonOutpost);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.RedFactory);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.StargateDefensePlatform);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.StargateDepot);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.DwarfEleriumContainer);

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
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalAncientPillars);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalSurveyRuins);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalGuardPost);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalVault);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalArchaeology);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalHellForge);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalEastTower);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalWestTower);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalGateTurret);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.PortalInferniteMine);

        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasMining);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NeutronMission);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NeutronMiner);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NeutronStellarForge);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.NeutronCitadel);

        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.MetalRefinery);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Mine);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.CoalMine);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Casino);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.HellSpaceCasino);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.RockQuarry);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.Sawmill);
        state.buildingManager.addBuildingToPriorityList(state.spaceBuildings.GasMoonOilExtractor);
        state.buildingManager.addBuildingToPriorityList(state.cityBuildings.MassDriver);

        // AutoBuild disabled by default for buildings consuming Soul Gems
        state.spaceBuildings.RedVrCenter.autoBuildEnabled = false;
        state.spaceBuildings.NeutronCitadel.autoBuildEnabled = false;
        state.spaceBuildings.PortalWarDroid.autoBuildEnabled = false;
        state.spaceBuildings.PortalWarDrone.autoBuildEnabled = false;
        state.spaceBuildings.PortalRepairDroid.autoBuildEnabled = false;
        state.spaceBuildings.Dreadnought.autoBuildEnabled = false;
        state.spaceBuildings.CruiserShip.autoBuildEnabled = false;
        state.spaceBuildings.FrigateShip.autoBuildEnabled = false;
        state.spaceBuildings.BologniumShip.autoBuildEnabled = false;
        state.spaceBuildings.CorvetteShip.autoBuildEnabled = false;
        state.spaceBuildings.ScoutShip.autoBuildEnabled = false;
        state.spaceBuildings.Alien2ArmedMiner.autoBuildEnabled = false;
        state.spaceBuildings.PortalVault.autoBuildEnabled = false;
        state.spaceBuildings.PortalHellForge.autoBuildEnabled = false;

        // Same for Scarletite
        state.spaceBuildings.PortalAncientPillars.autoBuildEnabled = false;
        state.spaceBuildings.PortalEastTower.autoBuildEnabled = false;
        state.spaceBuildings.PortalWestTower.autoBuildEnabled = false;
    }

    function resetProjectSettings() {
        settings.arpaBuildIfStorageFull = true;
        settings.arpaBuildIfStorageFullCraftableMin = -1;
        settings.arpaBuildIfStorageFullResourceMaxPercent = 5;
    }

    function resetProjectState() {
        state.projectManager.clearPriorityList();

        for (let key in state.projects) {
            let project = state.projects[key];
            project._autoMax = -1;
            project.autoBuildEnabled = false;
            state.projectManager.addProjectToPriorityList(project);
        }

        state.projects.LaunchFacility.autoBuildEnabled = true;
        state.projects.LaunchFacility.ignoreMinimumMoneySetting = true;
    }

    function resetProductionSettings() {
        settings.productionPrioritizeDemanded = true;
        settings.productionSmelting = "storage";
    }

    function resetProductionState() {
        // Smelter settings
        let smelter = state.cityBuildings.Smelter;
        let smelterPriority = 0;
        smelter.Fuels.Star.priority = smelterPriority++;
        smelter.Fuels.Inferno.priority = smelterPriority++;
        smelter.Fuels.Oil.priority = smelterPriority++;
        smelter.Fuels.Coal.priority = smelterPriority++;
        smelter.Fuels.Wood.priority = smelterPriority++;

        // Factory settings
        let productions = state.cityBuildings.Factory.Productions;
        Object.assign(productions.LuxuryGoods, {enabled: true, weighting: 1, priority: 2});
        Object.assign(productions.Furs, {enabled: true, weighting: 1, priority: 1});
        Object.assign(productions.Alloy, {enabled: true, weighting: 1, priority: 3});
        Object.assign(productions.Polymer, {enabled: true, weighting: 1, priority: 3});
        Object.assign(productions.NanoTube, {enabled: true, weighting: 4, priority: 3});
        Object.assign(productions.Stanene, {enabled: true, weighting: 4, priority: 3});

        Object.assign(resources.Plywood, {autoCraftEnabled: true, weighting: 1, preserve: 0});
        Object.assign(resources.Brick, {autoCraftEnabled: true, weighting: 1, preserve: 0});
        Object.assign(resources.Wrought_Iron, {autoCraftEnabled: true, weighting: 1, preserve: 0});
        Object.assign(resources.Sheet_Metal, {autoCraftEnabled: true, weighting: 3, preserve: 0});
        Object.assign(resources.Mythril, {autoCraftEnabled: true, weighting: 10, preserve: 0.1});
        Object.assign(resources.Aerogel, {autoCraftEnabled: true, weighting: 10, preserve: 0.1});
        Object.assign(resources.Nanoweave, {autoCraftEnabled: true, weighting: 10, preserve: 0.1});
        Object.assign(resources.Scarletite, {autoCraftEnabled: true, weighting: 10, preserve: 0.1});

        let droid = state.spaceBuildings.AlphaMiningDroid;
        Object.assign(droid.Productions.Adamantite, {priority: 3, weighting: 1});
        Object.assign(droid.Productions.Aluminium, {priority: 2, weighting: 1});
        Object.assign(droid.Productions.Uranium, {priority: 1, weighting: 1});
        Object.assign(droid.Productions.Coal, {priority: 1, weighting: 1});
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

    var settingsSections = ["generalSettingsCollapsed", "prestigeSettingsCollapsed", "evolutionSettingsCollapsed", "researchSettingsCollapsed", "marketSettingsCollapsed", "storageSettingsCollapsed",
                            "productionSettingsCollapsed", "warSettingsCollapsed", "hellSettingsCollapsed", "fleetSettingsCollapsed", "jobSettingsCollapsed", "buildingSettingsCollapsed", "projectSettingsCollapsed",
                            "governmentSettingsCollapsed", "loggingSettingsCollapsed", "minorTraitSettingsCollapsed", "weightingSettingsCollapsed", "ejectorSettingsCollapsed"];

    function updateStateFromSettings() {
        updateStandAloneSettings();

        settings.triggers = settings.triggers ?? [];
        state.triggerManager.clearPriorityList();
        settings.triggers.forEach(trigger => {
            // Hack for partial back compatibility with original script.
            if (techIds["tech-" + trigger.actionId]) {
                trigger.actionId = "tech-" + trigger.actionId;
            }
            if (techIds["tech-" + trigger.requirementId]) {
                trigger.requirementId = "tech-" + trigger.requirementId;
            }
            state.triggerManager.AddTriggerFromSetting(trigger.seq, trigger.priority, trigger.requirementType, trigger.requirementId, trigger.requirementCount, trigger.actionType, trigger.actionId, trigger.actionCount);
        });

        for (let i = 0; i < state.minorTraitManager.priorityList.length; i++) {
            let trait = state.minorTraitManager.priorityList[i];
            trait.autoMinorTraitEnabled = settings['mTrait_' + trait.traitName] ?? trait.autoMinorTraitEnabled;
            trait.autoMinorTraitWeighting = parseFloat(settings['mTrait_w_' + trait.traitName] ?? trait.autoMinorTraitWeighting);
            trait.priority = parseFloat(settings['mTrait_p_' + trait.traitName] ?? trait.priority);
        }
        state.minorTraitManager.sortByPriority();

        for (let i = 0; i < state.craftableResourceList.length; i++) {
            let resource = state.craftableResourceList[i];
            resource.autoCraftEnabled = settings['craft' + resource.id] ?? resource.autoCraftEnabled;
            resource.weighting = parseFloat(settings['foundry_w_' + resource.id] ?? resource.weighting);
            resource.preserve = parseFloat(settings['foundry_p_' + resource.id] ?? resource.preserve);
        }

        for (let i = 0; i < state.buildingManager.priorityList.length; i++) {
            let building = state.buildingManager.priorityList[i];
            building.autoBuildEnabled = settings['bat' + building.settingId] ?? building.autoBuildEnabled;
            building.priority = parseInt(settings['bld_p_' + building.settingId] ?? building.priority);
            building.autoStateEnabled = settings['bld_s_' + building.settingId] ?? building.autoStateEnabled;
            building.autoMax = parseInt(settings['bld_m_' + building.settingId] ?? building._autoMax);
            building._weighting = parseFloat(settings['bld_w_' + building.settingId] ?? building._weighting);
        }
        state.buildingManager.sortByPriority();

        for (let i = 0; i < state.jobManager.priorityList.length; i++) {
            let job = state.jobManager.priorityList[i];
            job.autoJobEnabled = settings['job_' + job._originalId] ?? job.autoJobEnabled;
            job.priority = parseInt(settings['job_p_' + job._originalId] ?? job.priority);
            job.setBreakpoint(1, settings['job_b1_' + job._originalId] ?? job.getBreakpoint(1));
            job.setBreakpoint(2, settings['job_b2_' + job._originalId] ?? job.getBreakpoint(2));
            job.setBreakpoint(3, settings['job_b3_' + job._originalId] ?? job.getBreakpoint(3));
        }
        state.jobManager.sortByPriority();

        settings.arpa = settings.arpa ?? {};
        for (let i = 0; i < state.projectManager.priorityList.length; i++) {
            let project = state.projectManager.priorityList[i];
            project.autoBuildEnabled = settings.arpa[project.id] ?? project.autoBuildEnabled;
            project.priority = parseInt(settings['arpa_p_' + project.id] ?? project.priority);
            project.autoMax = parseInt(settings['arpa_m_' + project.id] ?? project._autoMax);
            project.ignoreMinimumMoneySetting = settings['arpa_ignore_money_' + project.id] ?? project.ignoreMinimumMoneySetting;
        }
        state.projectManager.sortByPriority();

        for (let production of Object.values(state.cityBuildings.Factory.Productions)) {
            production.enabled = settings['production_' + production.resource.id] ?? production.enabled;
            production.weighting = parseInt(settings['production_w_' + production.resource.id] ?? production.weighting);
            production.priority = parseInt(settings['production_p_' + production.resource.id] ?? production.priority);
        }

        for (let fuel of Object.values(state.cityBuildings.Smelter.Fuels)) {
            fuel.priority = parseInt(settings['smelter_fuel_p_' + fuel.id] ?? fuel.priority);
        }

        for (let production of Object.values(state.spaceBuildings.AlphaMiningDroid.Productions)) {
            production.weighting = parseInt(settings['droid_w_' + production.resource.id] ?? production.weighting);
            production.priority = parseInt(settings['droid_pr_' + production.resource.id] ?? production.priority);
        }

        for (let resource of Object.values(resources)) {
            if (resource.isEjectable()) {
                resource.ejectEnabled = settings['res_eject' + resource.id] ?? resource.ejectEnabled;
            }
            if (resource.hasStorage()) {
                resource.autoStorageEnabled = settings['res_storage' + resource.id] ?? resource.autoStorageEnabled;
                resource.storeOverflow = settings['res_storage_o_' + resource.id] ?? resource.storeOverflow;
                resource.storagePriority = parseFloat(settings['res_storage_p_' + resource.id] ?? resource.storagePriority);
                resource._autoCratesMax = parseInt(settings['res_crates_m_' + resource.id] ?? resource._autoCratesMax);
                resource._autoContainersMax = parseInt(settings['res_containers_m_' + resource.id] ?? resource._autoContainersMax);
            }
            if (resource.isTradable()) {
                resource.marketPriority = parseInt(settings['res_buy_p_' + resource.id] ?? resource.marketPriority);
                resource.autoBuyEnabled = settings['buy' + resource.id] ?? resource.autoBuyEnabled;
                resource.autoBuyRatio = parseFloat(settings['res_buy_r_' + resource.id] ?? resource.autoBuyRatio);
                resource.autoSellEnabled = settings['sell' + resource.id] ?? resource.autoSellEnabled;
                resource.autoSellRatio = parseFloat(settings['res_sell_r_' + resource.id] ?? resource.autoSellRatio);
                resource.autoTradeBuyEnabled = settings['res_trade_buy_' + resource.id] ?? resource.autoTradeBuyEnabled;
                resource.autoTradeBuyRoutes = parseInt(settings['res_trade_buy_mtr_' + resource.id] ?? resource.autoTradeBuyRoutes);
                resource.autoTradeSellEnabled = settings['res_trade_sell_' + resource.id] ?? resource.autoTradeSellEnabled;
                resource.autoTradeSellMinPerSecond = parseFloat(settings['res_trade_sell_mps_' + resource.id] ?? resource.autoTradeSellMinPerSecond);
            }
        }
        state.storageManager.sortByPriority();
        state.marketManager.sortByPriority();

        for (let i = 0; i < poly.galaxyOffers.length; i++) {
            let resource = resources[poly.galaxyOffers[i].buy.res];
            resource.galaxyMarketWeighting = parseInt(settings['res_galaxy_w_' + resource.id] ?? resource.galaxyMarketWeighting);
            resource.galaxyMarketPriority = parseInt(settings['res_galaxy_p_' + resource.id] ?? resource.galaxyMarketPriority);
        }
    }

    function updateSettingsFromState() {
        updateStandAloneSettings();

        settings.triggers = JSON.parse(JSON.stringify(state.triggerManager.priorityList));

        // Hack for partial back compatibility with original script.
        for (let i = 0; i < settings.triggers.length; i++) {
            let trigger = settings.triggers[i];
            if (trigger.requirementType === "unlocked" && trigger.actionType === "research") {
                trigger.type = "tech";
            }
            if (techIds[trigger.requirementId]) {
                trigger.requirementId = techIds[trigger.requirementId].id;
            }
            if (techIds[trigger.actionId]) {
                trigger.actionId = techIds[trigger.actionId].id;
            }
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
            settings["foundry_p_" + resource.id] = resource.preserve;
        }

        for (let i = 0; i < state.jobManager.priorityList.length; i++) {
            const job = state.jobManager.priorityList[i];
            settings['job_' + job._originalId] = job.autoJobEnabled;
            settings['job_p_' + job._originalId] = job.priority;
            settings['job_b1_' + job._originalId] = job.getBreakpoint(1);
            settings['job_b2_' + job._originalId] = job.getBreakpoint(2);
            settings['job_b3_' + job._originalId] = job.getBreakpoint(3);
        }

        for (let i = 0; i < state.minorTraitManager.priorityList.length; i++) {
            const trait = state.minorTraitManager.priorityList[i];
            settings['mTrait_' + trait.traitName] = trait.autoMinorTraitEnabled;
            settings['mTrait_w_' + trait.traitName] = trait.autoMinorTraitWeighting;
            settings['mTrait_p_' + trait.traitName] = trait.priority;
        }

        settings.arpa = settings.arpa ?? {};
        for (let i = 0; i < state.projectManager.priorityList.length; i++) {
            const project = state.projectManager.priorityList[i];
            settings.arpa[project.id] = project.autoBuildEnabled;
            settings['arpa_p_' + project.id] = project.priority;
            settings['arpa_m_' + project.id] = project._autoMax;
            settings['arpa_ignore_money_' + project.id] = project.ignoreMinimumMoneySetting;
        }

        for (let production of Object.values(state.cityBuildings.Factory.Productions)) {
            settings["production_" + production.resource.id] = production.enabled;
            settings["production_w_" + production.resource.id] = production.weighting;
            settings["production_p_" + production.resource.id] = production.priority;
        }

        for (let fuel of Object.values(state.cityBuildings.Smelter.Fuels)) {
            settings["smelter_fuel_p_" + fuel.id] = fuel.priority;
        }

        for (let production of Object.values(state.spaceBuildings.AlphaMiningDroid.Productions)) {
            settings["droid_w_" + production.resource.id] = production.weighting;
            settings["droid_pr_" + production.resource.id] = production.priority;
        }

        for (let resource of Object.values(resources)) {
            if (resource.isEjectable()) {
                settings['res_eject' + resource.id] = resource.ejectEnabled;
            }
            if (resource.hasStorage()) {
                settings['res_storage' + resource.id] = resource.autoStorageEnabled;
                settings['res_storage_o_' + resource.id] = resource.storeOverflow;
                settings['res_storage_p_' + resource.id] = resource.storagePriority;
                settings['res_crates_m_' + resource.id] = resource._autoCratesMax;
                settings['res_containers_m_' + resource.id] = resource._autoContainersMax;
            }
            if (resource.isTradable()) {
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
        }

        for (let i = 0; i < poly.galaxyOffers.length; i++) {
            let resource = resources[poly.galaxyOffers[i].buy.res];
            settings['res_galaxy_w_' + resource.id] = resource.galaxyMarketWeighting;
            settings['res_galaxy_p_' + resource.id] = resource.galaxyMarketPriority;
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

        addSetting("evolutionQueue", []);
        addSetting("evolutionQueueEnabled", false);

        addSetting("storageLimitPreMad", true);
        addSetting("storageSafeReassign", true);
        addSetting("arpaBuildIfStorageFull", true);
        addSetting("arpaBuildIfStorageFullCraftableMin", -1);
        addSetting("arpaBuildIfStorageFullResourceMaxPercent", 5);

        addSetting("productionPrioritizeDemanded", true);
        addSetting("productionSmelting", "storage");

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
        addSetting("autoFleet", false);

        addSetting("autoGalaxyMarket", false);

        addSetting("logEnabled", true);
        Object.keys(loggingTypes).forEach(loggingTypeKey => {
            let loggingType = loggingTypes[loggingTypeKey];
            addSetting(loggingType.settingKey, true)
        });

        addSetting("autoQuarry", false);
        addSetting("autoSmelter", false);
        addSetting("autoFactory", false);
        addSetting("autoMiningDroid", false);
        addSetting("autoGraphenePlant", false);
        addSetting("prestigeType", "none");
        addSetting("prestigeMADIgnoreArpa", true);
        addSetting("prestigeMADWait", true);
        addSetting("prestigeBioseedConstruct", true);
        addSetting("prestigeBioseedProbes", 3);
        addSetting("prestigeWhiteholeMinMass", 8);
        addSetting("prestigeWhiteholeStabiliseMass", true);
        addSetting("prestigeWhiteholeEjectEnabled", true);
        addSetting("prestigeWhiteholeEjectExcess", false);
        addSetting("prestigeWhiteholeDecayRate", 0.2);
        addSetting("prestigeWhiteholeEjectAllCount", 5);

        addSetting("autoAssembleGene", false);
        addSetting("genesAssembleGeneAlways", false);

        addSetting("minimumMoney", 0);
        addSetting("minimumMoneyPercentage", 0);
        addSetting("tradeRouteMinimumMoneyPerSecond", 300);
        addSetting("tradeRouteMinimumMoneyPercentage", 50);
        addSetting("generalMinimumTaxRate", 0);
        addSetting("generalMinimumMorale", 105)
        addSetting("generalMaximumMorale", 500);
        addSetting("govManage", false);
        addSetting("govInterim", governmentTypes.democracy.id);
        addSetting("govFinal", governmentTypes.technocracy.id);
        addSetting("govSpace", governmentTypes.corpocracy.id);

        addSetting("foreignAttackLivingSoldiersPercent", 90);
        addSetting("foreignAttackHealthySoldiersPercent", 90);
        addSetting("foreignHireMercMoneyStoragePercent", 90);
        addSetting("foreignHireMercCostLowerThan", 50000);
        addSetting("foreignMinAdvantage", 40);
        addSetting("foreignMaxAdvantage", 50);
        addSetting("foreignMaxSiegeBattalion", 15);

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
        addSetting("researchAlienGift", true);

        addSetting("buildingBuildIfStorageFull", false);
        addSetting("buildingShrineType", "any");
        addSetting("buildingAlwaysClick", false);
        addSetting("buildingClickPerTick", 50);
        addSetting("buildingWeightingNew", 3);
        addSetting("buildingWeightingUselessPowerPlant", 0.01);
        addSetting("buildingWeightingNeedfulPowerPlant", 3);
        addSetting("buildingWeightingUnderpowered", 0.8);
        addSetting("buildingWeightingUselessKnowledge", 0.01);
        addSetting("buildingWeightingNeedfulKnowledge", 5);
        addSetting("buildingWeightingUnusedEjectors", 0.1);
        addSetting("buildingWeightingMADUseless", 0);
        addSetting("buildingWeightingCrateUseless", 0.01);
        addSetting("buildingWeightingMissingFuel", 10);
        addSetting("buildingWeightingNonOperatingCity", 0.2);
        addSetting("buildingWeightingNonOperating", 0);
        addSetting("buildingWeightingTriggerConflict", 0);
        addSetting("buildingWeightingMissingSupply", 0);

        addSetting("buildingEnabledAll", true);
        addSetting("buildingStateAll", true);

        addSetting("triggerRequest", true);
        addSetting("queueRequest", true);
        addSetting("researchRequest", true);
        addSetting("missionRequest", true);

        // Collapse or expand settings sections
        for (let i = 0; i < settingsSections.length; i++) {
            addSetting(settingsSections[i], true);
        }

        for (let i = 0; i < galaxyRegions.length; i++) {
            addSetting("fleet_w_" + galaxyRegions[i], 1);
            addSetting("fleet_p_" + galaxyRegions[i], galaxyRegions.length - i);
        }

        // TODO: Remove me after few more versions. Clean up old fork-only settings, not used neither here, nor in original script.
        for (let resource of Object.values(resources)) {
            if (!resource.isTradable()) {
                delete settings['res_buy_p_' + resource.id];
                delete settings['buy' + resource.id];
                delete settings['res_buy_r_' + resource.id];
                delete settings['sell' + resource.id];
                delete settings['res_sell_r_' + resource.id];
                delete settings['res_trade_buy_' + resource.id];
                delete settings['res_trade_buy_mtr_' + resource.id];
                delete settings['res_trade_sell_' + resource.id];
                delete settings['res_trade_sell_mps_' + resource.id];
            }
        }
        delete settings.buildingWeightingQueued;
        delete settings.buildingStrictMode;
        delete settings.evolutionIgnore;
        delete settings.productionMinRatio;
        delete settings.buildingEstimateTime;
        delete settings.buildingWeightingQueueHelper;
        delete settings.smelter_fuel_p_StarPower;
        for (let production of Object.values(state.spaceBuildings.AlphaMiningDroid.Productions)) {
            delete settings["droid_p_" + production.resource.id];
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
        if (game.global.race.species !== "protoplasm") {
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
            updateStateFromSettings();
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
                    let raceGroup = state.raceGroupAchievementList[i];
                    let remainingAchievements = 0;
                    let remainingRace = null;

                    for (let j = 0; j < raceGroup.length; j++) {
                        let race = raceGroup[j];

                        // Ignore Valdi if we're not going for 4star, and locked conditional races
                        if ((race === races.junker && achievementLevel < 5) || !race.evolutionCondition()) {
                            continue;
                        }

                        // We're going for greatness achievement only when bioseeding, if not - go for extinction
                        if ((settings.prestigeType === "bioseed" && !race.isGreatnessAchievementUnlocked(achievementLevel)) ||
                            (settings.prestigeType !== "bioseed" && !race.isMadAchievementUnlocked(achievementLevel))) {
                            remainingRace = race;
                            remainingAchievements++;

                            // We're forcing Valdi to be the very last chosen race, when there's no other options, by overriding remainingPercent
                            if (race === races.junker) {
                                remainingAchievements = 0.01;
                            }
                        }
                    }

                    // If we have Mass Extinction perk, and not affected by randomness - prioritize conditional races
                    if (remainingRace !== races.junker && game.global.stats.achieve['mass_extinction'] && remainingAchievements > 0 && remainingRace.evolutionConditionText !== '') {
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
                    challenge.click()
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
                let rnaCost = poly.adjustCosts(Number(evolution.definition.cost["RNA"]()) || 0);
                maxRNA = Math.max(maxRNA, rnaCost);
            }

            if (costs["DNA"]) {
                let dnaCost = poly.adjustCosts(Number(evolution.definition.cost["DNA"]()) || 0);
                maxDNA = Math.max(maxDNA, dnaCost);
            }
        }

        // Gather some resources and evolve
        let DNAForEvolution = Math.min(maxDNA - resources.DNA.currentQuantity, resources.DNA.maxQuantity - resources.DNA.currentQuantity, resources.RNA.maxQuantity / 2);
        let RNAForDNA = Math.min(DNAForEvolution * 2 - resources.RNA.currentQuantity, resources.RNA.maxQuantity - resources.RNA.currentQuantity);
        let RNARemaining = resources.RNA.currentQuantity + RNAForDNA - DNAForEvolution * 2;
        let RNAForEvolution = Math.min(maxRNA - RNARemaining, resources.RNA.maxQuantity - RNARemaining);

        let rna = game.actions.evolution.rna;
        let dna = game.actions.evolution.dna;
        for (let i = 0; i < RNAForDNA; i++) { rna.action(); }
        for (let i = 0; i < DNAForEvolution; i++) { dna.action(); }
        for (let i = 0; i < RNAForEvolution; i++) { rna.action(); }

        resources.RNA.currentQuantity = RNARemaining + RNAForEvolution;
        resources.DNA.currentQuantity = resources.DNA.currentQuantity + DNAForEvolution;

        // Lets go for our targeted evolution
        for (let i = 0; i < state.evolutionTarget.evolutionTree.length; i++) {
            let action = state.evolutionTarget.evolutionTree[i];
            if (action.isUnlocked()) {
                // Don't click challenges which already active
                if (action instanceof ChallengeEvolutionAction && action !== state.evolutions.Bunker && game.global.race[action.effectId]) {
                    continue;
                }
                if (action.click()) {
                    // If we successfully click the action then return to give the ui some time to refresh
                    return;
                } else {
                    // Our path is unlocked but we can't click it yet
                    break;
                }
            }
        }

        if (state.evolutions.Mitochondria.count < 1 || resources.RNA.maxQuantity < maxRNA || resources.DNA.maxQuantity < maxDNA) {
            state.evolutions.Mitochondria.click();
        }
        if (state.evolutions.EukaryoticCell.count < 1 || resources.DNA.maxQuantity < maxDNA) {
            state.evolutions.EukaryoticCell.click();
        }
        if (resources.RNA.maxQuantity < maxRNA) {
            state.evolutions.Membrane.click();
        }
        if (state.evolutions.Nucleus.count < 10) {
            state.evolutions.Nucleus.click();
        }
        if (state.evolutions.Organelles.count < 10) {
            state.evolutions.Organelles.click()
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
                if (planet.trait && !isAchievementUnlocked("atmo_" + planet.trait, alevel)) {
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

    //#endregion Auto Evolution

    //#region Auto Crafting

    function autoCraft() {
        if (!resources.Population.isUnlocked()) { return; }
        if (game.global.race['no_craft']) { return; }

        craftLoop:
        for (let i = 0; i < state.craftableResourceList.length; i++) {
            let craftable = state.craftableResourceList[i];
            if (!craftable.isUnlocked()) {
                continue;
            }

            if (craftable.autoCraftEnabled) {
                let craftRatio = getCraftRatio(craftable);

                //console.log("resource: " + craftable.id + ", length: " + craftable.requiredResources.length);
                for (let i = 0; i < craftable.resourceRequirements.length; i++) {
                    //console.log("resource: " + craftable.id + " required resource: " + craftable.requiredResources[i].id);
                    if (craftable.resourceRequirements[i].resource.storageRatio < craftRatio) {
                        continue craftLoop;
                    }
                }

                craftable.tryCraftX(5);
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

        let [rank, subdued, bestTarget] = findAttackTarget();

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

    // Rank inferiors and superiors cities, count subdued cities, and select looting target
    function findAttackTarget() {
        let rank = [];
        let attackIndex = -1;
        let subdued = 0;
        for (let i = 0; i < 3; i++){
            if (getGovPower(i) <= settings.foreignPowerRequired) {
                rank[i] = "Inferior";
            } else {
                rank[i] = "Superior";
            }

            if (settings.foreignUnification) {
                let gov = game.global.civic.foreign[`gov${i}`];
                let policy = settings[`foreignPolicy${rank[i]}`];
                if ((gov.anx && policy === "Annex") ||
                    (gov.buy && policy === "Purchase") ||
                    (gov.occ && policy === "Occupy")) {
                    subdued++;
                    continue;
                }
            }

            if (rank[i] === "Inferior" || i === 0) {
                attackIndex = i;
            }
        }

        return [rank, subdued, attackIndex];
    }

    function autoBattle() {
        let m = state.warManager;

        if (!m.initGarrison() || m.maxCityGarrison <= 0) {
            return;
        }

        // Don't send our troops out if we're preparing for MAD as we need all troops at home for maximum plasmids
        if (state.goal === "PreparingMAD") {
            m.hireMercenary(); // but hire mercenaries if we can afford it to get there quicker
            return;
        }

        // Mercenaries can still be hired once the "foreign" section is hidden by unification so do this before checking if warManager is unlocked
        if (m.isMercenaryUnlocked()) {
            let mercenariesHired = 0;
            while (m.currentSoldiers < m.maxSoldiers && resources.Money.storageRatio > settings.foreignHireMercMoneyStoragePercent / 100) {
                let mercenaryCost = m.getMercenaryCost();
                if (mercenaryCost > settings.foreignHireMercCostLowerThan || mercenaryCost > resources.Money.currentQuantity) {
                    break;
                }

                m.hireMercenary();
                mercenariesHired++;
            }

            // Log the interaction
            if (mercenariesHired === 1) {
                state.log.logSuccess(loggingTypes.mercenary, `Hired a mercenary to join the garrison.`);
            } else if (mercenariesHired > 1) {
                state.log.logSuccess(loggingTypes.mercenary, `Hired ${mercenariesHired} mercenaries to join the garrison.`);
            }
        }

        // Stop here, if we don't want to attack anything
        if (settings.foreignPacifist || !m.isForeignUnlocked()) {
            return;
        }

        // If we are not fully ready then return
        if (m.wounded > (1 - settings.foreignAttackHealthySoldiersPercent / 100) * m.maxCityGarrison ||
            m.currentCityGarrison < settings.foreignAttackLivingSoldiersPercent / 100 * m.maxCityGarrison) {
            return;
        }

        let bestAttackRating = game.armyRating(m.currentCityGarrison - m.wounded, m._textArmy);
        let requiredTactic = 0;

        let [rank, subdued, attackIndex] = findAttackTarget();

        // Check if there's something that we want and can occupy, and switch to that target if found
        for (let i = 0; i < 3; i++){
            if (settings[`foreignPolicy${rank[i]}`] === "Occupy" && !game.global.civic.foreign[`gov${i}`].occ
                && getAdvantage(bestAttackRating, 4, i) >= settings.foreignMinAdvantage) {
                attackIndex = i;
                requiredTactic = 4;
                break;
            }
        }

        // Nothing to attack
        if (attackIndex < 0) {
            return;
        }
        let gov = game.global.civic.foreign[`gov${attackIndex}`];

        // Check if we want and can unify, unless we're already about to occupy something
        if (requiredTactic !== 4 && subdued >= 2 && isResearchUnlocked("unification")){
            if (settings.foreignOccupyLast && getAdvantage(bestAttackRating, 4, attackIndex) >= settings.foreignMinAdvantage) {
                // Occupy last force
                requiredTactic = 4;
            }
            if (!settings.foreignOccupyLast && (settings[`foreignPolicy${rank[attackIndex]}`] === "Annex" || settings[`foreignPolicy${rank[attackIndex]}`] === "Purchase")) {
                // We want to Annex or Purchase last one, stop attacking so we can influence it
                return;
            }
        }

        let minSoldiers = null;
        let maxSoldiers = null;

        // Check if we can siege for loot
        if (requiredTactic !== 4) {
            let minSiegeSoldiers = m.getSoldiersForAttackRating(getRatingForAdvantage(settings.foreignMinAdvantage, 4, attackIndex));
            if (minSiegeSoldiers <= settings.foreignMaxSiegeBattalion && minSiegeSoldiers <= m.currentCityGarrison) {
                minSoldiers = minSiegeSoldiers;
                maxSoldiers = Math.min(m.getSoldiersForAttackRating(getRatingForAdvantage(settings.foreignMaxAdvantage, 4, attackIndex)), settings.foreignMaxSiegeBattalion+1);
                requiredTactic = 4;
            }
        }

        // If we aren't going to siege our target, then let's find best tactic for plundering
        if (requiredTactic !== 4) {
            for (let i = 3; i > 0; i--) {
                if (getAdvantage(bestAttackRating, i, attackIndex) >= settings.foreignMinAdvantage) {
                    requiredTactic = i;
                    break;
                }
            }
        }

        minSoldiers = minSoldiers ?? m.getSoldiersForAttackRating(getRatingForAdvantage(settings.foreignMinAdvantage, requiredTactic, attackIndex));
        maxSoldiers = maxSoldiers ?? m.getSoldiersForAttackRating(getRatingForAdvantage(settings.foreignMaxAdvantage, requiredTactic, attackIndex));

        // Max soldiers advantage should be above our max. Let's tune it down to stay in prefered range, if we can
        if (maxSoldiers > minSoldiers) {
            maxSoldiers--;
        }
        maxSoldiers = Math.min(maxSoldiers, m.currentCityGarrison - m.wounded);

        // Occupy can pull soldiers from ships, let's make sure it won't happen
        if (gov.anx || gov.buy || gov.occ) {
            // If it occupied currently - we'll get enough soldiers just by unoccupying it
            m.launchCampaign(attackIndex);
        } else if (requiredTactic == 4 && m.crew > 0) {
            let occCost = game.global.civic.govern.type === "federation" ? 15 : 20;
            let missingSoldiers = occCost - (m.currentCityGarrison - m.wounded - maxSoldiers);
            if (missingSoldiers > 0) {
                // Not enough soldiers in city, let's try to pull them from hell
                if (!m.initHell() || m.hellSoldiers - m.hellReservedSoldiers < missingSoldiers) {
                    return;
                }
                let patrolsToRemove = Math.ceil((missingSoldiers - m.hellGarrison) / m.hellPatrolSize);
                if (patrolsToRemove > 0) {
                    m.removeHellPatrol(patrolsToRemove);
                }
                m.removeHellGarrison(missingSoldiers);
            }
        }

        // Set attack type
        while (m.tactic < requiredTactic) {
            m.increaseCampaignDifficulty();
        }
        while (m.tactic > requiredTactic) {
            m.decreaseCampaignDifficulty();
        }

        // Now adjust our battalion size to fit between our campaign attack rating ranges
        let deltaBattalion = maxSoldiers - m.raid;
        if (deltaBattalion > 0) {
            m.addBattalion(deltaBattalion);
        }
        if (deltaBattalion < 0) {
            m.removeBattalion(deltaBattalion * -1);
        }

        // Log the interaction
        let campaignTitle = m.getCampaignTitle(requiredTactic);
        let aproximateSign = gov.spy < 1 ? "~" : "";
        let battalionRating = game.armyRating(m.raid, "army");
        let advantagePercent = getAdvantage(battalionRating, requiredTactic, attackIndex).toFixed(1);
        state.log.logSuccess(loggingTypes.attack, `Launching ${campaignTitle} campaign against ${getGovName(attackIndex)} with ${aproximateSign}${advantagePercent}% advantage.`);

        m.launchCampaign(attackIndex);
    }

    //#endregion Auto Battle

    //#region Auto Hell

    function autoHell() {
        let m = state.warManager;

        if (!m.initHell()) {
            return;
        }

        if (settings.hellTurnOffLogMessages) {
            if (game.global.portal.fortress.notify === "Yes") {
                $("#fort .b-checkbox").eq(0).click();
            }
            if (game.global.portal.fortress.s_ntfy === "Yes") {
                $("#fort .b-checkbox").eq(1).click();
            }
        }

        // Determine the number of powered attractors
        // The goal is to keep threat in the desired range
        // If threat is larger than the configured top value, turn all attractors off
        // If threat is lower than the bottom value, turn all attractors on
        // Linear in between
        m.hellAttractorMax = 0;
        if (settings.hellHandleAttractors && game.global.portal.attractor && game.global.portal.fortress.threat < settings.hellAttractorTopThreat && m.hellAssigned > 0) {
            m.hellAttractorMax = game.global.portal.attractor.count;
            if (game.global.portal.fortress.threat > settings.hellAttractorBottomThreat && settings.hellAttractorTopThreat > settings.hellAttractorBottomThreat) {
                m.hellAttractorMax = Math.floor(m.hellAttractorMax * (settings.hellAttractorTopThreat - game.global.portal.fortress.threat)
                                                    / (settings.hellAttractorTopThreat - settings.hellAttractorBottomThreat));
            }
        }

        if (!settings.hellHandlePatrolCount) { return; }

        // Determine Patrol size and count
        let targetHellSoldiers = 0;
        let targetHellPatrols = 0;
        let targetHellPatrolSize = 0;
        // First handle not having enough soldiers, then handle patrols
        // Only go into hell at all if soldiers are close to full, or we are already there
        if (m.maxSoldiers > settings.hellHomeGarrison + settings.hellMinSoldiers &&
           (m.hellSoldiers > settings.hellMinSoldiers || (m.currentSoldiers >= m.maxSoldiers * settings.hellMinSoldiersPercent / 100))) {
            targetHellSoldiers = Math.min(m.currentSoldiers, m.maxSoldiers - settings.hellHomeGarrison); // Leftovers from an incomplete patrol go to hell garrison
            let availableHellSoldiers = targetHellSoldiers - m.hellReservedSoldiers;

            // Determine target hell garrison size
            // Estimated average damage is roughly 35 * threat / defense, so required defense = 35 * threat / targetDamage
            // But the threat hitting the fortress is only an intermediate result in the bloodwar calculation, it happens after predators and patrols but before repopulation,
            // So siege threat is actually lower than what we can see. Patrol and drone damage is wildly swingy and hard to estimate, so don't try to estimate the post-fight threat.
            // Instead base the defense on the displayed threat, and provide an option to bolster defenses when the walls get low. The threat used in the calculation
            // ranges from 1 * threat for 100% walls to the multiplier entered in the settings at 0% walls.
            let hellWallsMulti = settings.hellLowWallsMulti * (1 - game.global.portal.fortress.walls / 100); // threat modifier from damaged walls = 1 to lowWallsMulti
            let hellTargetFortressDamage = game.global.portal.fortress.threat * 35 / settings.hellTargetFortressDamage; // required defense to meet target average damage based on current threat
            let hellTurretPower = state.spaceBuildings.PortalTurret.stateOnCount * (game.global.tech['turret'] ? (game.global.tech['turret'] >= 2 ? 70 : 50) : 35); // turrets count and power
            let hellGarrison = m.getSoldiersForAttackRating(Math.max(0, hellWallsMulti * hellTargetFortressDamage - hellTurretPower)); // don't go below 0

            // Always have at least half our hell contingent available for patrols, and if we cant defend properly just send everyone
            if (availableHellSoldiers < hellGarrison) {
                hellGarrison = 0; // If we cant defend adequately, send everyone out on patrol
            } else if (availableHellSoldiers < hellGarrison * 2) {
                hellGarrison = Math.floor(availableHellSoldiers / 2); // Always try to send out at least half our people
            }

            // Guardposts need at least one soldier free so lets just always keep one handy
            if (state.spaceBuildings.PortalGuardPost.count > 0) {
                hellGarrison = hellGarrison + 1 + state.spaceBuildings.PortalGuardPost.stateOnCount;
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
                    const homeGarrisonFillRatio = m.currentCityGarrison / m.maxCityGarrison;
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
                targetHellPatrolSize = m.getSoldiersForAttackRating(patrolRating);

                // If patrol size is larger than available soldiers, send everyone available instead of 0
                targetHellPatrolSize = Math.min(targetHellPatrolSize, availableHellSoldiers - hellGarrison);
            } else {
                targetHellPatrolSize = m.hellPatrolSize;
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
            if (m.hellAssigned > 0) {
                m.removeHellPatrolSize(25000);
                m.removeHellPatrol(25000);
                m.removeHellGarrison(25000);
                return;
            }
        }

        // Adjust values ingame
        // First decrease patrols, then put hell soldiers to the right amount, then increase patrols, to make sure all actions go through
        if (settings.hellHandlePatrolSize && m.hellPatrolSize > targetHellPatrolSize) m.removeHellPatrolSize(m.hellPatrolSize - targetHellPatrolSize);
        if (m.hellPatrols > targetHellPatrols) m.removeHellPatrol(m.hellPatrols - targetHellPatrols);
        if (m.hellSoldiers > targetHellSoldiers) m.removeHellGarrison(m.hellSoldiers - targetHellSoldiers);
        if (m.hellSoldiers < targetHellSoldiers) m.addHellGarrison(targetHellSoldiers - m.hellSoldiers);
        if (settings.hellHandlePatrolSize && m.hellPatrolSize < targetHellPatrolSize) m.addHellPatrolSize(targetHellPatrolSize - m.hellPatrolSize);
        if (m.hellPatrols < targetHellPatrols) m.addHellPatrol(targetHellPatrols - m.hellPatrols);
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
        if (isDemonRace()) {
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

        let requiredJobs = [];
        let jobAdjustments = [];

        log("autoJobs", "Total employees: " + availableEmployees);

        // First figure out how many farmers are required
        if (state.jobs.Farmer.isManaged()) {
            let foodRateOfChange = resources.Food.calculateRateOfChange({buy: true});
            let minFoodStorage = 0.2;
            let maxFoodStorage = 0.6;
            if (game.global.race['ravenous']) {
                minFoodStorage = 0.01;
                maxFoodStorage = 0.02;
                foodRateOfChange++;
            }
            if (jobList.length === 1) {
                // No other jobs are unlocked - everyone on farming!
                requiredJobs[farmerIndex] = availableEmployees;
                log("autoJobs", "Pushing all farmers")
            } else if (resources.Population.currentQuantity > state.lastPopulationCount) {
                let populationChange = resources.Population.currentQuantity - state.lastPopulationCount;
                let farmerChange = state.jobs.Farmer.count - state.lastFarmerCount;

                if (populationChange === farmerChange && foodRateOfChange > 0) {
                    requiredJobs[farmerIndex] = Math.max(state.jobs.Farmer.count - populationChange, 0);
                    log("autoJobs", "Removing a farmer due to population growth")
                } else {
                    requiredJobs[farmerIndex] = state.jobs.Farmer.count;
                }
            } else if (resources.Food.storageRatio < minFoodStorage && foodRateOfChange < 0) {
                // We want food to fluctuate between 0.2 and 0.6 only. We only want to add one per loop until positive
                requiredJobs[farmerIndex] = Math.min(state.jobs.Farmer.count + 1, availableEmployees);
                log("autoJobs", "Adding one farmer")
            } else if (resources.Food.storageRatio > maxFoodStorage && foodRateOfChange > 0) {
                // We want food to fluctuate between 0.2 and 0.6 only. We only want to remove one per loop until negative
                requiredJobs[farmerIndex] = Math.max(state.jobs.Farmer.count - 1, 0);
                log("autoJobs", "Removing one farmer")
            } else if (resources.Food.storageRatio > 0.3 && foodRateOfChange > 100) {
                // If we have over 30% storage and have > 100 food per second then remove a farmer
                requiredJobs[farmerIndex] = Math.max(state.jobs.Farmer.count - 1, 0);
                log("autoJobs", "Removing one farmer - 100 food per second")
            } else if (isHunterRace() && resources.Food.storageRatio > 0.3 && foodRateOfChange > resources.Population.currentQuantity / 10) {
                // Carnivore race. We've got some food so put them to work!
                requiredJobs[farmerIndex] = Math.max(state.jobs.Farmer.count - 1, 0);
                log("autoJobs", "Removing one farmer - Carnivore")
            } else {
                // We're good; leave farmers as they are
                requiredJobs[farmerIndex] = state.jobs.Farmer.count;
                log("autoJobs", "Leaving current farmers")
            }

            log("autoJobs", "currentQuantity " + resources.Population.currentQuantity + " breakpoint1Max " + breakpoint1Max + " requiredJobs[0] " + requiredJobs[0] + " breakpointEmployees(1) " + state.jobs.Lumberjack.breakpointEmployees(1) +  " breakpointEmployees(0) " + state.jobs.Lumberjack.breakpointEmployees(0))
            if (isDemonRace()) {
                if (availableEmployees > breakpoint0Max && requiredJobs[farmerIndex] < state.jobs.Lumberjack.breakpointEmployees(1)) {
                    log("autoJobs", "Setting required hunters to breakpoint 1")
                    requiredJobs[farmerIndex] = state.jobs.Lumberjack.breakpointEmployees(1);
                } else if (requiredJobs[farmerIndex] < state.jobs.Lumberjack.breakpointEmployees(0)) {
                    log("autoJobs", "Setting required hunters to breakpoint 0")
                    requiredJobs[farmerIndex] = state.jobs.Lumberjack.breakpointEmployees(0);
                }
            }

            if (requiredJobs[farmerIndex] < 0) { requiredJobs[farmerIndex] = 0; }

            jobAdjustments[farmerIndex] = requiredJobs[farmerIndex] - state.jobs.Farmer.count;
            availableEmployees -= requiredJobs[farmerIndex];
        }

        // We're only crafting when we have enough population to fill farmers, all foundries, and still have some employees for other work.
        if (settings.autoCraftsmen && availableEmployees > availableCraftsmen * 2) {
            availableEmployees -= availableCraftsmen;
        } else {
            availableCraftsmen = 0;
        }

        // Now assign crafters
        if (settings.autoCraftsmen){
            // Taken from game source, no idea what this "140" means.
            let traitsResourceful0 = 10;
            let speed = game.global.genes['crafty'] ? 2 : 1;
            let craft_costs = game.global.race['resourceful'] ? (1 - traitsResourceful0 / 100) : 1;
            let costMod = speed * craft_costs / 140;

            // Get list of craftabe resources
            let availableJobs = [];
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

                if (lowestRatio < job.resource.preserve) {
                    continue;
                }

                if (job === state.jobs.Scarletite) {
                    let maxScar = state.spaceBuildings.PortalHellForge.stateOnCount;
                    if (afforableAmount < maxScar) {
                        jobAdjustments[jobList.indexOf(job)] = 0 - job.count;
                    } else {
                        jobAdjustments[jobList.indexOf(job)] = maxScar - job.count;
                        availableCraftsmen -= maxScar;
                    }
                    continue;
                }

                if (afforableAmount < availableCraftsmen){
                    continue;
                }

                availableJobs.push(job);
            }

            let requestedJobs = availableJobs.filter(job => job.resource.requestedQuantity > 0);
            if (requestedJobs.length > 0) {
                availableJobs = requestedJobs;
            } else if (settings.productionPrioritizeDemanded) {
                let usefulJobs = availableJobs.filter(job => job.resource.currentQuantity < job.resource.storageRequired);
                if (usefulJobs.length > 0) {
                    availableJobs = usefulJobs;
                }
            }

            // Sort them by amount and weight. Yes, it can be empty, not a problem.
            availableJobs.sort((a, b) => (a.resource.currentQuantity / a.resource.weighting) - (b.resource.currentQuantity / b.resource.weighting));

            for (let i = 0; i < state.jobManager.craftingJobs.length; i++) {
                const job = state.jobManager.craftingJobs[i];
                const jobIndex = jobList.indexOf(job);

                if (jobIndex === -1 || job === state.jobs.Scarletite) {
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
                if (job === state.jobs.Banker && resources.Money.storageRatio > 0.98 && !isResearchUnlocked("swiss_banking")) {
                    jobsToAssign = 0;
                }

                // Races with the Intelligent trait get bonus production based on the number of professors and scientists
                // Only unassign them when knowledge is max if the race is not intelligent
                // Once we've research shotgun sequencing we get boost and soon autoassemble genes so stop unassigning
                if (!game.global.race['intelligent'] && !isResearchUnlocked("shotgun_sequencing")) {
                    // Don't assign professors if our knowledge is maxed and professors aren't contributing to our temple bonus
                    if (job === state.jobs.Professor && resources.Knowledge.storageRatio > 0.99 && !isResearchUnlocked("indoctrination")) {
                        jobsToAssign = 0;
                    }

                    // Don't assign scientists if our knowledge is maxed and scientists aren't contributing to our knowledge cap
                    if (job === state.jobs.Scientist && resources.Knowledge.storageRatio > 0.99 && !isResearchUnlocked("scientific_journal")) {
                        jobsToAssign = 0;
                    }
                }

                // Stone income fluctuate a lot when we're managing smoldering quarry, ignore it
                if (job === state.jobs.CementWorker && (!game.global.race['smoldering'] || !settings.autoQuarry)) {
                    let currentCementWorkers = job.count;
                    log("autoJobs", "jobsToAssign: " + jobsToAssign + ", currentCementWorkers" + currentCementWorkers + ", resources.stone.rateOfChange " + resources.Stone.rateOfChange);

                    let stoneRateOfChange = resources.Stone.calculateRateOfChange({buy: true});

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

                jobsToAssign = Math.max(0, jobsToAssign);

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

            if (isDemonRace() && lumberjackIndex !== -1) {
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
                if (isDemonRace() && lumberjackIndex !== -1) {
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
                    if (availableEmployees <= 0 || (isDemonRace() && jobDetails.job === state.jobs.Lumberjack)) {
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
        if (isHunterRace()) {
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
                state.jobs.Farmer.setAsDefault();
            } else if (state.jobs.QuarryWorker.isUnlocked() && state.jobs.QuarryWorker.count > 0) {
                state.jobs.QuarryWorker.setAsDefault();
            } else if (state.jobs.Lumberjack.isUnlocked() && state.jobs.Lumberjack.count > 0) {
                state.jobs.Lumberjack.setAsDefault();
            } else if (state.jobs.CrystalMiner.isUnlocked() && state.jobs.CrystalMiner.count > 0) {
                state.jobs.CrystalMiner.setAsDefault();
            } else if (state.jobs.Scavenger.isUnlocked() && state.jobs.Scavenger.count > 0) {
                state.jobs.Scavenger.setAsDefault();
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

        // main.js -> let mBaseCap = xxxx
        let maxMorale = 100 + state.cityBuildings.Amphitheatre.count + state.cityBuildings.Casino.stateOnCount + state.spaceBuildings.HellSpaceCasino.stateOnCount
            + (state.spaceBuildings.RedVrCenter.stateOnCount * 2) + (state.spaceBuildings.AlphaExoticZoo.stateOnCount * 2) + (state.spaceBuildings.Alien1Resort.stateOnCount * 2)
            + (state.projects.Monument.level * 2);

        if (game.global.tech['superstar']) {
            maxMorale += state.jobs.Entertainer.count;
        }

        if (game.global.stats.achieve['joyless']){
            maxMorale += game.global.stats.achieve['joyless'].l * 2;
        }

        // Tax rate calculation
        let minTaxRate = 10;
        let maxTaxRate = 30;
        if (game.global.tech.currency >= 5 || game.global.race['terrifying']) {
            minTaxRate = 0;
            maxTaxRate = 50;
        }
        if (game.global.race['noble']) {
            minTaxRate = 10;
            maxTaxRate = 20;
        }
        if (game.global.civic.govern.type === 'oligarchy') {
            maxTaxRate += 20;
        }

        maxMorale += 10 - Math.floor(minTaxRate / 2);

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

    function autoQuarry() {
        let quarry = state.cityBuildings.RockQuarry;

        // Nothing to do here with no quarry, or smoldering
        if (!quarry.initIndustry()) {
            return;
        }

        let chrysotileRatio = resources.Chrysotile.requestedQuantity > 0 ? Number.MIN_VALUE : resources.Chrysotile.storageRatio;
        let stoneRatio = resources.Stone.requestedQuantity > 0 ? Number.MIN_VALUE : resources.Stone.storageRatio;
        if (state.cityBuildings.MetalRefinery.count > 0) {
            stoneRatio = Math.min(stoneRatio, resources.Aluminium.requestedQuantity > 0 ? Number.MIN_VALUE : resources.Aluminium.storageRatio);
        }

        let newAsbestos = 50;
        if (chrysotileRatio < stoneRatio) {
            newAsbestos = 100 - Math.round(chrysotileRatio / stoneRatio * 50);
        }
        if (stoneRatio < chrysotileRatio) {
            newAsbestos = Math.round(stoneRatio / chrysotileRatio * 50);
        }
        if (newAsbestos !== quarry.currentAsbestos) {
            let deltaAsbestos = newAsbestos - quarry.currentAsbestos;
            quarry.increaseAsbestos(deltaAsbestos);
        }
    }

    //#region Auto Smelter

    function autoSmelter() {
        let smelter = state.cityBuildings.Smelter;

        // No smelter; no auto smelter. No soup for you.
        if (game.global.race['steelen'] || !smelter.initIndustry()) {
            return;
        }

        // Only adjust fuels if race does not have forge trait which means they don't require smelter fuel
        if (!game.global.race['forge']) {
            let remainingSmelters = smelter.maxOperating;

            let fuels = smelter.fuelPriorityList();
            let fuelAdjust = {};
            fuels.forEach(fuel => {
                if (remainingSmelters <= 0 || !fuel.unlocked) {
                    return;
                }

                let maxAllowedUnits = remainingSmelters;
                fuel.cost.forEach(productionCost => {
                    let resource = productionCost.resource;

                    let remainingRateOfChange = resource.calculateRateOfChange({buy: true}) + (smelter.fueledCount(fuel) * productionCost.quantity);
                    // No need to preserve minimum income when storage is full
                    if (resource.storageRatio < 0.98) {
                        remainingRateOfChange -= productionCost.minRateOfChange;
                    }

                    if (resource.storageRatio < 0.8 || resource === resources.StarPower){
                        let affordableAmount = Math.max(0, Math.floor(remainingRateOfChange / productionCost.quantity));
                        maxAllowedUnits = Math.min(maxAllowedUnits, affordableAmount);
                    }
                });

                remainingSmelters -= maxAllowedUnits;
                fuelAdjust[fuel.id] = maxAllowedUnits - smelter.fueledCount(fuel);
            });

            fuels.forEach(fuel => {
                if (fuelAdjust[fuel.id] < 0) {
                    smelter.decreaseFuel(fuel, -fuelAdjust[fuel.id]);
                }
            });

            fuels.forEach(fuel => {
                if (fuelAdjust[fuel.id] > 0) {
                    smelter.increaseFuel(fuel, fuelAdjust[fuel.id]);
                }
            });
        }

        let smelterIronCount = smelter.smeltingCount(smelter.Productions.Iron);
        let smelterSteelCount = smelter.smeltingCount(smelter.Productions.Steel);
        let maxAllowedSteel = smelter.maxOperating;

        // We only care about steel. It isn't worth doing a full generic calculation here
        // Just assume that smelters will always be fueled so Iron smelting is unlimited
        // We want to work out the maximum steel smelters that we can have based on our resource consumption
        let steelSmeltingConsumption = smelter.Productions.Steel.cost;
        for (let i = 0; i < steelSmeltingConsumption.length; i++) {
            let productionCost = steelSmeltingConsumption[i];
            let resource = productionCost.resource;

            let remainingRateOfChange = resource.calculateRateOfChange({buy: true}) + (smelterSteelCount * productionCost.quantity);
            // No need to preserve minimum income when storage is full
            if (resource.storageRatio < 0.98) {
                remainingRateOfChange -= productionCost.minRateOfChange;
            }
            if (resource.storageRatio < 0.8){
                let affordableAmount = Math.max(0, Math.floor(remainingRateOfChange / productionCost.quantity));
                maxAllowedSteel = Math.min(maxAllowedSteel, affordableAmount);
            }
        }

        let ironWeighting = 0;
        let steelWeighting = 0;
        switch (settings.productionSmelting){
            case "iron":
                ironWeighting = resources.Iron.timeToFull;
                if (!ironWeighting) {
                    steelWeighting = resources.Steel.timeToFull;
                }
                break;
            case "steel":
                steelWeighting = resources.Steel.timeToFull;
                if (!steelWeighting) {
                    ironWeighting = resources.Iron.timeToFull;
                }
                break;
            case "storage":
                ironWeighting = resources.Iron.timeToFull;
                steelWeighting = resources.Steel.timeToFull;
                break;
            case "required":
                ironWeighting = resources.Iron.timeToRequired;
                steelWeighting = resources.Steel.timeToRequired;
                break;
        }

        if (resources.Iron.requestedQuantity > 0) {
            ironWeighting = Number.MAX_SAFE_INTEGER;
        }
        if (resources.Steel.requestedQuantity > 0) {
            steelWeighting = Number.MAX_SAFE_INTEGER;
        }


        // We have more steel than we can afford OR iron income is too low
        if (smelterSteelCount > maxAllowedSteel || smelterSteelCount > 0 && ironWeighting > steelWeighting) {
            smelter.increaseSmelting(smelter.Productions.Iron, 1);
        }

        // We can afford more steel AND either steel income is too low OR both steel and iron full, but we can use steel smelters to increase titanium income
        if (smelterSteelCount < maxAllowedSteel && smelterIronCount > 0 &&
             ((steelWeighting > ironWeighting) ||
              (steelWeighting === 0 && ironWeighting === 0 && resources.Titanium.storageRatio < 0.99 && isResearchUnlocked("hunter_process")))) {
            smelter.increaseSmelting(smelter.Productions.Steel, 1);
        }

        // It's possible to also remove steel smelters when when we have nothing to produce, to save some coal
        // Or even disable them completely. But it doesn't worth it. Let it stay as it is, without jerking around
    }

    //#endregion Auto Smelter

    //#region Auto Factory

    function autoFactory() {
        let factory = state.cityBuildings.Factory;

        // No factory; no auto factory
        if (!factory.initIndustry()) {
            return;
        }

        let allProducts = Object.values(factory.Productions);

        // Init adjustment, and sort groups by priorities
        let priorityGroups = {};
        let factoryAdjustments = {};
        for (let i = 0; i < allProducts.length; i++) {
            let production = allProducts[i];
            if (production.unlocked && production.enabled) {
                let priority = production.resource.requestedQuantity > 0 ? Number.MAX_SAFE_INTEGER : production.priority;
                priorityGroups[priority] = priorityGroups[priority] ?? [];
                priorityGroups[priority].push(production);

                factoryAdjustments[production.id] = 0;
            }
        }
        let priorityList = Object.keys(priorityGroups).sort((a, b) => b - a).map(key => priorityGroups[key]);

        // Calculate amount of factories per product
        let remainingFactories = factory.maxOperating;
        for (let i = 0; i < priorityList.length && remainingFactories > 0; i++) {
            let products = priorityList[i];
            while (remainingFactories > 0) {
                let factoriesToDistribute = remainingFactories;
                let totalPriorityWeight = products.reduce((sum, production) => sum + production.weighting, 0);

                for (let j = products.length - 1; j >= 0 && remainingFactories > 0; j--) {
                    let production = products[j];

                    let calculatedRequiredFactories = Math.min(remainingFactories, Math.max(1, Math.floor(factoriesToDistribute / totalPriorityWeight * production.weighting)));
                    let actualRequiredFactories = calculatedRequiredFactories;
                    if (production.resource.storageRatio > 0.99) {
                        actualRequiredFactories = 0;
                    }

                    production.cost.forEach(resourceCost => {
                        if (!resourceCost.resource.isUnlocked()) {
                            return;
                        }

                        let previousCost = factory.currentProduction(production) * resourceCost.quantity;
                        let currentCost = factoryAdjustments[production.id] * resourceCost.quantity;
                        let rate = resourceCost.resource.calculateRateOfChange({buy: true}) + previousCost - currentCost;
                        if (resourceCost.resource.storageRatio < 0.98) {
                            rate -= resourceCost.minRateOfChange;
                        }

                        // If we can't afford it (it's above our minimum rate of change) then remove a factory
                        // UNLESS we've got over 80% storage full. In that case lets go wild!
                        if (resourceCost.resource.storageRatio < 0.8){
                            let affordableAmount = Math.floor(rate / resourceCost.quantity);
                            actualRequiredFactories = Math.min(actualRequiredFactories, affordableAmount);
                        }
                    });

                    // If we're going for bioseed - try to balance neutronium\nanotubes ratio
                    if (settings.prestigeBioseedConstruct && settings.prestigeType === "bioseed" && production === factory.Productions.NanoTube && resources.Neutronium.currentQuantity < 250) {
                        actualRequiredFactories = 0;
                    }

                    if (actualRequiredFactories > 0){
                        remainingFactories -= actualRequiredFactories;
                        factoryAdjustments[production.id] += actualRequiredFactories;
                    }

                    // We assigned less than wanted, i.e. we either don't need this product, or can't afford it. In both cases - we're done with it.
                    if (actualRequiredFactories < calculatedRequiredFactories) {
                        products.splice(j, 1);
                    }
                }

                if (factoriesToDistribute === remainingFactories) {
                    break;
                }
            }
        }

        // First decrease any production so that we have room to increase others
        for (let production of allProducts) {
            if (factoryAdjustments[production.id] !== undefined) {
                let deltaAdjustments = factoryAdjustments[production.id] - factory.currentProduction(production);

                if (deltaAdjustments < 0) {
                    factory.decreaseProduction(production, deltaAdjustments * -1);
                }
            }
        }

        // Increase any production required (if they are 0 then don't do anything with them)
        for (let production of allProducts) {
            if (factoryAdjustments[production.id] !== undefined) {
                let deltaAdjustments = factoryAdjustments[production.id] - factory.currentProduction(production);

                if (deltaAdjustments > 0) {
                    factory.increaseProduction(production, deltaAdjustments);
                }
            }
        }
    }

    //#endregion Auto Factory

    //#region Auto Mining Droid

    function autoMiningDroid() {
        let droid = state.spaceBuildings.AlphaMiningDroid;

        // If not unlocked then nothing to do
        if (!droid.initIndustry()) {
            return;
        }

        let allProducts = Object.values(droid.Productions);

        // Init adjustment, and sort groups by priorities
        let priorityGroups = {};
        let factoryAdjustments = {};
        for (let i = 0; i < allProducts.length; i++) {
            let production = allProducts[i];
            let priority = production.resource.requestedQuantity > 0 ? Number.MAX_SAFE_INTEGER : production.priority;
            priorityGroups[priority] = priorityGroups[priority] ?? [];
            priorityGroups[priority].push(production);

            factoryAdjustments[production.id] = 0;
        }
        let priorityList = Object.keys(priorityGroups).sort((a, b) => b - a).map(key => priorityGroups[key]);

        // Calculate amount of factories per product
        let remainingFactories = droid.maxOperating;
        for (let i = 0; i < priorityList.length && remainingFactories > 0; i++) {
            let products = priorityList[i];
            while (remainingFactories > 0) {
                let factoriesToDistribute = remainingFactories;
                let totalPriorityWeight = products.reduce((sum, production) => sum + production.weighting, 0);

                for (let j = products.length - 1; j >= 0 && remainingFactories > 0; j--) {
                    let production = products[j];

                    let calculatedRequiredFactories = Math.min(remainingFactories, Math.max(1, Math.floor(factoriesToDistribute / totalPriorityWeight * production.weighting)));
                    let actualRequiredFactories = calculatedRequiredFactories;
                    if (production.resource.storageRatio > 0.99) {
                        actualRequiredFactories = 0;
                    }

                    if (actualRequiredFactories > 0){
                        remainingFactories -= actualRequiredFactories;
                        factoryAdjustments[production.id] += actualRequiredFactories;
                    }

                    // We assigned less than wanted, i.e. we either don't need this product, or can't afford it. In both cases - we're done with it.
                    if (actualRequiredFactories < calculatedRequiredFactories) {
                        products.splice(j, 1);
                    }
                }

                if (factoriesToDistribute === remainingFactories) {
                    break;
                }
            }
        }
        if (remainingFactories > 0) {
            return;
        }

        // First decrease any production so that we have room to increase others
        for (let production of allProducts) {
            if (factoryAdjustments[production.id] !== undefined) {
                let deltaAdjustments = factoryAdjustments[production.id] - droid.currentProduction(production);

                if (deltaAdjustments < 0) {
                    droid.decreaseProduction(production, deltaAdjustments * -1);
                }
            }
        }

        // Increase any production required (if they are 0 then don't do anything with them)
        for (let production of allProducts) {
            if (factoryAdjustments[production.id] !== undefined) {
                let deltaAdjustments = factoryAdjustments[production.id] - droid.currentProduction(production);

                if (deltaAdjustments > 0) {
                    droid.increaseProduction(production, deltaAdjustments);
                }
            }
        }
    }

    //#endregion Auto Mining Droid

    //#region Auto Graphene Plant

    function autoGraphenePlant() {
        let plant = state.spaceBuildings.AlphaFactory;

        // If not unlocked then nothing to do
        if (!plant.initIndustry()) {
            return;
        }

        // We've already got our cached values so just check if there is any need to change our ratios
        let remainingPlants = plant.stateOnCount;

        let sortedFuel = Object.values(plant.Fuels).sort((a, b) => b.resource.storageRatio - a.resource.storageRatio);
        for (let fuel of sortedFuel) {
            let resource = fuel.resource;
            let quantity = fuel.quantity;

            if (remainingPlants === 0) {
                return;
            }
            if (!resource.isUnlocked()) {
                continue;
            }

            let currentFuelCount = plant.fueledCount(fuel);
            let rateOfChange = resource.calculateRateOfChange({buy: true}) + (quantity * currentFuelCount);

            let maxFueledForConsumption = remainingPlants;
            if (resource.storageRatio < 0.8){
                let affordableAmount = Math.floor(rateOfChange / quantity);
                maxFueledForConsumption = Math.max(Math.min(maxFueledForConsumption, affordableAmount), 0);
            }

            // Only produce graphene above cap if there's working BlackholeMassEjector, otherwise there's no use for excesses for sure.
            if (resources.Graphene.storageRatio > 0.99 && resources.Graphene.currentEject <= 0) {
                maxFueledForConsumption = 0;
            }

            let deltaFuel = maxFueledForConsumption - currentFuelCount;
            if (deltaFuel !== 0) {
                plant.increaseFuel(fuel, deltaFuel);
            }

            remainingPlants -= currentFuelCount + deltaFuel;
        }
    }

    //#endregion Auto Graphene Plant

    //#region Mass Ejector

    /** @type { { resource: Resource, requirement: number }[] } */
    var resourcesByAtomicMass = [];

    function autoMassEjector() {
        let ejector = state.spaceBuildings.BlackholeMassEjector
        if (ejector.stateOnCount === 0) {
            return;
        }

        // Eject everything!
        if (ejector.stateOnCount >= settings.prestigeWhiteholeEjectAllCount) {
            let remaining = ejector.stateOnCount * 1000;

            resourcesByAtomicMass.forEach(resourceRequirement => {
                let resource = resourceRequirement.resource;
                let roundedRateOfChange = Math.floor(resource.calculateRateOfChange({buy: true, eject: true}));

                if (remaining <= 0 || !resource.ejectEnabled) {
                    resourceRequirement.requirement = 0;
                    return;
                }

                // These are from the autoPower(). If we reduce below these figures then buildings start being turned off...
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
                    } else if (resource.storageRatio > 0.01) {
                        resourceRequirement.requirement = Math.max(0, Math.min(remaining, resource.currentEject + roundedRateOfChange));
                    } else {
                        resourceRequirement.requirement = 0;
                    }
                }

                remaining -= resourceRequirement.requirement;
            });
        }

        // Limited eject
        if (ejector.stateOnCount < settings.prestigeWhiteholeEjectAllCount) {
            let remaining = ejector.stateOnCount * 1000;

            // First we want to eject capped resources
            resourcesByAtomicMass.forEach(resourceRequirement => {
                let resource = resourceRequirement.resource;

                if (remaining <= 0 || !resource.ejectEnabled || resource.storageRatio < 0.985) {
                    resourceRequirement.requirement = 0;
                    return;
                }

                resourceRequirement.requirement = Math.min(remaining, Math.ceil(resource.calculateRateOfChange({buy: true})));
                remaining -= resourceRequirement.requirement;
            });

            // And if we still have some ejectors remaining, let's try to find something else
            if (remaining > 0 && (settings.prestigeWhiteholeEjectExcess || (game.global.race['decay'] && settings.prestigeWhiteholeDecayRate > 0))) {
                resourcesByAtomicMass.forEach(resourceRequirement => {
                    let resource = resourceRequirement.resource;

                    if (remaining <= 0 || !resource.ejectEnabled) {
                        return;
                    }

                    let ejectableAmount = resourceRequirement.requirement;
                    remaining += resourceRequirement.requirement;

                    // Decay is tricky. We want to start ejecting as soon as possible... but won't have full storages here. Let's eject x% of decayed amount, unless it's on demand.
                    if (game.global.race['decay'] && resource.requestedQuantity <= 0) {
                        ejectableAmount = Math.max(ejectableAmount, Math.floor(resource.currentDecay * settings.prestigeWhiteholeDecayRate));
                    }

                    if (settings.prestigeWhiteholeEjectExcess && resource.storageRequired > 0 && resource.currentQuantity >= resource.storageRequired && resource.requestedQuantity <= 0) {
                        ejectableAmount = Math.max(ejectableAmount, Math.ceil(resource.currentQuantity - resource.storageRequired + resource.calculateRateOfChange({buy: true, sell: true, decay: true})));
                    }

                    resourceRequirement.requirement = Math.min(remaining, ejectableAmount);
                    remaining -= resourceRequirement.requirement;
                });
            }
        }

        // Decrement first to free up space
        resourcesByAtomicMass.forEach(resourceRequirement => {
            let resource = resourceRequirement.resource;
            let adjustment = resourceRequirement.requirement - resource.currentEject;
            if (adjustment < 0) {
                resource.decreaseEjection(adjustment * -1);
            }
        });

        // Increment any remaining items
        resourcesByAtomicMass.forEach(resourceRequirement => {
            let resource = resourceRequirement.resource;
            let adjustment = resourceRequirement.requirement - resource.currentEject;
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
        if (!game.global['interstellar'] || !game.global.interstellar['stellar_engine'] || !game.global.interstellar.stellar_engine['mass'] || !game.global.interstellar.stellar_engine['exotic']) { return 0; }
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

        if (!settings.prestigeMADWait || (state.warManager.currentSoldiers === state.warManager.maxSoldiers && resources.Population.currentQuantity === resources.Population.maxQuantity)) {
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
            state.spaceBuildings.GasSpaceDockLaunch.click();
        } else if (state.spaceBuildings.GasSpaceDockPrepForLaunch.isUnlocked()) {
            state.spaceBuildings.GasSpaceDockPrepForLaunch.click();
        } else {
            // Open the modal to update the options
            state.spaceBuildings.GasSpaceDock.cacheOptions();
        }

    }

    function isBioseederPrestigeAvailable() {
        let spaceDock = state.spaceBuildings.GasSpaceDock;
        if (!spaceDock.isUnlocked()) { return false; }
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
        if (game.global.tech["genetics"] < 6 || resources.Knowledge.currentQuantity < 200000) {
            return;
        }

        let nextTickKnowledge = resources.Knowledge.currentQuantity + resources.Knowledge.rateOfChange * (game.global.settings.at > 0 ? 2 : 1) * (game.global.race['hyper'] ? 1.05 : 1) * (game.global.race['slow'] ? 0.9 : 1);
        let overflowKnowledge = nextTickKnowledge - resources.Knowledge.maxQuantity;
        if (overflowKnowledge < 0) {
            return;
        }

        let vue = getVueById("arpaSequence");
        if (vue === undefined) {
            return false;
        }

        let genesToAssemble = Math.ceil(overflowKnowledge / 200000);
        for (let i = 0; i < genesToAssemble; i++) {
            vue.novo();
            resources.Knowledge.currentQuantity -= 200000;
            resources.Genes.currentQuantity += 1;
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
        if (!m.isUnlocked()) {
            return;
        }

        adjustTradeRoutes();

        // Manual trade disabled
        if (game.global.race['no_trade']) {
            return;
        }

        let currentMultiplier = m.multiplier; // Save the current multiplier so we can reset it at the end of the function
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
                    maxAllowedUnits = Math.min(maxAllowedUnits, Math.floor(resource.calculateRateOfChange({all: true}) * 2)); // If resource is full then sell up to 2 seconds worth of production
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

    function autoGalaxyMarket() {
        let freighter = state.spaceBuildings.GorddonFreighter;

        // If not unlocked then nothing to do
        if (!freighter.initIndustry()) {
            return;
        }

         // Init adjustment, and sort groups by priorities
        let priorityGroups = {};
        let tradeAdjustments = {};
        for (let i = 0; i < poly.galaxyOffers.length; i++) {
            let trade = poly.galaxyOffers[i];
            let buyResource = resources[trade.buy.res];

            let priority = buyResource.requestedQuantity > 0 ? Number.MAX_SAFE_INTEGER : buyResource.galaxyMarketPriority;

            priorityGroups[priority] = priorityGroups[priority] ?? [];
            priorityGroups[priority].push(trade);

            tradeAdjustments[buyResource.id] = 0;
        }
        let priorityList = Object.keys(priorityGroups).sort((a, b) => b - a).map(key => priorityGroups[key]);

        // Calculate amount of factories per product
        let remainingFreighters = freighter.maxOperating;
        for (let i = 0; i < priorityList.length && remainingFreighters > 0; i++) {
            let trades = priorityList[i];
            while (remainingFreighters > 0) {
                let freightersToDistribute = remainingFreighters;
                let totalPriorityWeight = trades.reduce((sum, trade) => sum + resources[trade.buy.res].galaxyMarketWeighting, 0);

                for (let j = trades.length - 1; j >= 0 && remainingFreighters > 0; j--) {
                    let trade = trades[j];
                    let buyResource = resources[trade.buy.res];
                    let sellResource = resources[trade.sell.res];

                    let calculatedRequiredFreighters = Math.min(remainingFreighters, Math.max(1, Math.floor(freightersToDistribute / totalPriorityWeight * buyResource.galaxyMarketWeighting)));
                    let actualRequiredFreighters = calculatedRequiredFreighters;
                    if (buyResource.storageRatio > 0.99 || sellResource.storageRatio < 0.1) {
                        actualRequiredFreighters = 0;
                    }

                    if (actualRequiredFreighters > 0){
                        remainingFreighters -= actualRequiredFreighters;
                        tradeAdjustments[buyResource.id] += actualRequiredFreighters;
                    }

                    // We assigned less than wanted, i.e. we either don't need this product, or can't afford it. In both cases - we're done with it.
                    if (actualRequiredFreighters < calculatedRequiredFreighters) {
                        trades.splice(j, 1);
                    }
                }

                if (freightersToDistribute === remainingFreighters) {
                    break;
                }
            }
        }

        // First decrease any production so that we have room to increase others
        for (let i = 0; i < poly.galaxyOffers.length; i++) {
            let buyResource = resources[poly.galaxyOffers[i].buy.res];

            if (tradeAdjustments[buyResource.id] !== undefined) {
                let deltaAdjustments = tradeAdjustments[buyResource.id] - freighter.currentProduction(i);

                if (deltaAdjustments < 0) {
                    freighter.decreaseProduction(i, deltaAdjustments * -1);
                }
            }
        }

        // Increase any production required (if they are 0 then don't do anything with them)
        for (let i = 0; i < poly.galaxyOffers.length; i++) {
            let buyResource = resources[poly.galaxyOffers[i].buy.res];

            if (tradeAdjustments[buyResource.id] !== undefined) {
                let deltaAdjustments = tradeAdjustments[buyResource.id] - freighter.currentProduction(i);

                if (deltaAdjustments > 0) {
                    freighter.increaseProduction(i, deltaAdjustments);
                }
            }
        }
    }

    //#region Auto Building

    function getResourcesPerClick() {
      let amount = 1;
      let traitsStrong0 = 5;
      if (game.global.race['strong']) {
        amount *= traitsStrong0;
      }
      if (game.global.genes['enhance']) {
        amount *= 2;
      }
      return amount;
    }

    function autoGatherResources() {
        // Don't spam click once we've got a bit of population going
        if (!settings.buildingAlwaysClick && resources.Population.currentQuantity > 15 && (state.cityBuildings.RockQuarry.count > 0 || game.global.race['sappy'])) {
            return;
        }

        // Uses exposed action handlers, bypassing vue - they much faster, and that's important with a lot of calls
        let resPerClick = getResourcesPerClick();
        let amount = 0;
        if (state.cityBuildings.Food.isClickable()){
            if (game.global.tech['conjuring']) {
                amount = Math.floor(Math.min((resources.Food.maxQuantity - resources.Food.currentQuantity) / (resPerClick * 10), resources.Mana.currentQuantity, settings.buildingClickPerTick));
                resources.Mana.currentQuantity -= amount;
                resources.Food.currentQuantity += amount * resPerClick;
            } else {
                amount = Math.ceil(Math.min((resources.Food.maxQuantity - resources.Food.currentQuantity) / resPerClick, settings.buildingClickPerTick));
                resources.Food.currentQuantity = Math.min(resources.Food.currentQuantity + amount * resPerClick, resources.Food.maxQuantity);
            }
            let food = game.actions.city.food;
            for (let i = 0; i < amount; i++) {
                food.action();
            }
        }
        if (state.cityBuildings.Lumber.isClickable()){
            if (game.global.tech['conjuring'] >= 2) {
                amount = Math.floor(Math.min((resources.Lumber.maxQuantity - resources.Lumber.currentQuantity) / (resPerClick * 10), resources.Mana.currentQuantity, settings.buildingClickPerTick));
                resources.Mana.currentQuantity -= amount;
                resources.Lumber.currentQuantity += amount * resPerClick;
            } else {
                amount = Math.ceil(Math.min((resources.Lumber.maxQuantity - resources.Lumber.currentQuantity) / resPerClick, settings.buildingClickPerTick));
                resources.Lumber.currentQuantity = Math.min(resources.Lumber.currentQuantity + amount * resPerClick, resources.Food.maxQuantity);
            }
            let lumber = game.actions.city.lumber;
            for (let i = 0; i < amount; i++) {
                lumber.action();
            }
        }
        if (state.cityBuildings.Stone.isClickable()){
            if (game.global.tech['conjuring'] >= 2) {
                amount = Math.floor(Math.min((resources.Stone.maxQuantity - resources.Stone.currentQuantity) / (resPerClick * 10), resources.Mana.currentQuantity, settings.buildingClickPerTick));
                resources.Mana.currentQuantity -= amount;
                resources.Stone.currentQuantity += amount * resPerClick;
            } else {
                amount = Math.ceil(Math.min((resources.Stone.maxQuantity - resources.Stone.currentQuantity) / resPerClick, settings.buildingClickPerTick));
                resources.Stone.currentQuantity = Math.min(resources.Stone.currentQuantity + amount * resPerClick, resources.Food.maxQuantity);
            }
            let stone = game.actions.city.stone;
            for (let i = 0; i < amount; i++) {
                stone.action();
            }
        }
        if (state.cityBuildings.Chrysotile.isClickable()){
            if (game.global.tech['conjuring'] >= 2) {
                amount = Math.floor(Math.min((resources.Chrysotile.maxQuantity - resources.Chrysotile.currentQuantity) / (resPerClick * 10), resources.Mana.currentQuantity, settings.buildingClickPerTick));
                resources.Mana.currentQuantity -= amount;
                resources.Chrysotile.currentQuantity += amount * resPerClick;
            } else {
                amount = Math.ceil(Math.min((resources.Chrysotile.maxQuantity - resources.Chrysotile.currentQuantity) / resPerClick, settings.buildingClickPerTick));
                resources.Chrysotile.currentQuantity = Math.min(resources.Chrysotile.currentQuantity + amount * resPerClick, resources.Food.maxQuantity);
            }
            let chrysotile = game.actions.city.chrysotile;
            for (let i = 0; i < amount; i++) {
                chrysotile.action();
            }
        }
        if (state.cityBuildings.Slaughter.isClickable()){
            amount = Math.min(Math.max(resources.Lumber.maxQuantity - resources.Lumber.currentQuantity, resources.Food.maxQuantity - resources.Food.currentQuantity, resources.Furs.maxQuantity - resources.Furs.currentQuantity) / resPerClick, settings.buildingClickPerTick);
            let slaughter = game.actions.city.slaughter;
            for (let i = 0; i < amount; i++) {
                slaughter.action();
            }
            resources.Lumber.currentQuantity = Math.min(resources.Lumber.currentQuantity + amount * resPerClick, resources.Lumber.maxQuantity);
            if (game.global.race['soul_eater'] && game.global.tech.primitive){
                resources.Food.currentQuantity = Math.min(resources.Food.currentQuantity + amount * resPerClick, resources.Food.maxQuantity);
            }
            if (resources.Furs.isUnlocked()) {
                resources.Furs.currentQuantity = Math.min(resources.Furs.currentQuantity + amount * resPerClick, resources.Furs.maxQuantity);
            }
        }
    }

    function autoBuild() {
        // Space dock is special and has a modal window with more buildings!
        if (!state.spaceBuildings.GasSpaceDock.isOptionsCached()) {
            if (state.spaceBuildings.GasSpaceDock.cacheOptions()) {
                return;
            }
        }

        // Check for active build triggers, and click if possible
        for (let i = 0; i < state.triggerTargets.length; i++) {
            let building = state.triggerTargets[i];
            if (building instanceof Action && building.isClickable()) {
                building.click();
                if (building._tab === "space" || building._tab === "interstellar" || building._tab === "portal") {
                    removePoppers();
                }
                return;
            }
        }

        let buildingList = state.buildingManager.managedPriorityList();

        // Sort array so we'll have prioritized buildings on top. We'll need that below to avoid deathlocks, when building 1 waits for building 2, and building 2 waits for building 3. That's something we don't want to happen when building 1 and building 3 doesn't conflicts with each other.
        buildingList.sort((a, b) => b.weighting - a.weighting);

        let estimatedTime = [];
        // Loop through the auto build list and try to buy them
        buildingsLoop:
        for (let i = 0; i < buildingList.length; i++) {
            let building = buildingList[i];

            // Only go further if we can build it right now
            if (!game.checkAffordable(building.definition, false) || state.queuedTargets.includes(building)) {
                continue;
            }

            // Checks weights, if this building doesn't demands any overflowing resources(unless we ignoring overflowing)
            if (!settings.buildingBuildIfStorageFull || !building.resourceRequirements.some(requirement => requirement.resource.storageRatio > 0.98)) {
              for (let j = 0; j < buildingList.length; j++) {
                let other = buildingList[j];

                // We only care about buildings with highter weight
                // And we don't want to process clickable buildings - list was sorted by weight, and all buildings with highter priority should already been proccessed.
                // If that thing is affordable, but wasn't bought - it means something block it, and it won't be builded soon anyway, so we'll ignore it's demands.
                if (building.weighting >= other.weighting || (game.checkAffordable(other.definition, false) && !state.queuedTargets.includes(other))){
                    continue;
                }
                let weightDiffRatio = other.weighting / building.weighting;

                // Calculate time to build for competing building, if it's not cached
                if (!estimatedTime[other.id]){
                    estimatedTime[other.id] = [];

                    for (let k = 0; k < other.resourceRequirements.length; k++) {
                        let resource = other.resourceRequirements[k].resource;
                        let quantity = other.resourceRequirements[k].quantity;

                        // Ignore locked
                        if (!resource.isUnlocked()) {
                            continue;
                        }

                        let totalRateOfCharge = resource.calculateRateOfChange({buy: true});
                        if (totalRateOfCharge <= 0) {
                            // Craftables and such, which not producing at this moment. We can't realistically calculate how much time it'll take to fulfil requirement(too many factors), so let's assume we can get it any any moment.
                            estimatedTime[other.id][resource.id] = 0;
                        } else {
                            estimatedTime[other.id][resource.id] = (quantity - resource.currentQuantity) / totalRateOfCharge;
                        }
                    }
                    estimatedTime[other.id].total = Math.max(0, ...Object.values(estimatedTime[other.id]));
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
                  if (thisRequirement.quantity <= (estimatedTime[other.id].total - estimatedTime[other.id][resource.id]) * resource.calculateRateOfChange({buy: true})) {
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
            if (building.click()) {
                if (building._tab === "space" || building._tab === "interstellar" || building._tab === "portal") {
                    removePoppers();
                }
                break;
            }
        }
    }

    //#endregion Auto Building

    //#region Auto Research

    function autoResearch() {
        let items = $('#tech .action:not(.cna)');

        // Check if we have something researchable
        if (items.length === 0){
            return;
        }

        // Check for active triggers, and click if possible
        for (let i = 0; i < state.triggerTargets.length; i++) {
            let tech = state.triggerTargets[i];
            if (tech instanceof Technology && tech.isClickable()) {
                tech.click();
                removePoppers();
                return;
            }
        }

        for (let i = 0; i < items.length; i++) {
            let itemId = items[i].id;

            // Block research that conflics with active triggers or queue
            if (getCostConflict(techIds[itemId])) {
                continue;
            }

            // Don't click any reset options without user consent... that would be a dick move, man.
            if (itemId === "tech-exotic_infusion" || itemId === "tech-infusion_check" || itemId === "tech-infusion_confirm" ||
                itemId === "tech-dial_it_to_11" || itemId === "tech-limit_collider" || itemId === "tech-demonic_infusion" || itemId == "tech-dark_bomb") {
                continue;
            }

            // Don't waste phage and plasmid on ascension techs if we're not going there
            if ((itemId === "tech-incorporeal" || itemId === "tech-tech_ascension") && settings.prestigeType !== "ascension") {
                continue;
            }

            // Alien Gift
            if (itemId === "tech-xeno_gift" && !settings.researchAlienGift) {
                continue;
            }

            // Unification
            if (itemId === "tech-unification2" && !settings.foreignUnification) {
                continue;
            }

            // If user wants to stabilise blackhole when under minimum solar mass then do it
            if (itemId === "tech-stabilize_blackhole" && (!settings.prestigeWhiteholeStabiliseMass || getBlackholeMass() >= settings.prestigeWhiteholeMinMass)) {
                continue;
            }

            if (itemId !== settings.userResearchTheology_1) {
                if (itemId === "tech-anthropology" && !(settings.userResearchTheology_1 === "auto" && settings.prestigeType === "mad")) {
                    continue;
                }

                if (itemId === "tech-fanaticism" && !(settings.userResearchTheology_1 === "auto" && settings.prestigeType !== "mad")) {
                    continue;
                }
            }

            if (itemId !== settings.userResearchTheology_2) {
                if (itemId === "tech-deify" && !(settings.userResearchTheology_2 === "auto" && settings.prestigeType === "ascension")) {
                    continue;
                }

                if (itemId === "tech-study" && !(settings.userResearchTheology_2 === "auto" && settings.prestigeType !== "ascension")) {
                    continue;
                }
            }

            if (techIds[itemId].click()) {
                // The unification techs are special as they are always "clickable" even if they can't be afforded.
                // We don't want to continually remove the poppers if the script is clicking one every second that
                // it can't afford
                removePoppers();
                return;
            }
        }
    }

    //#endregion Auto Research

    //#region Auto ARPA

    function autoArpa() {
        let projectList = state.projectManager.managedPriorityList();

        if (settings.prestigeMADIgnoreArpa && !game.global.race['cataclysm'] && !isResearchUnlocked("mad")) {
            return;
        }

        // Loop through our managed projects
        for (let i = 0; i < projectList.length; i++) {
            const project = projectList[i];

            // Only level up to user defined max
            if (project.level >= project.autoMax) {
                continue;
            }

            if (!getCostConflict(project)) {
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

                // Don't use all Deuterium, we need it for upkeep
                if (requirement.resource === resources.Deuterium && requirement.resource.currentQuantity - onePercentOfRequirementQuantity < 100) {
                    log("autoARPA", "break: Deuterium current - requirement < 100");
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

            if (allowBuild && !getCostConflict(project)) {
                log("autoARPA", "full resources build " + project.id)
                project.tryBuild(false);
            }
        }
    }

    //#endregion Auto ARPA

    //#region Auto Power

    function autoPower() {
        // Only start doing this once power becomes available. Isn't useful before then
        if (!resources.Power.isUnlocked()) {
            return;
        }

        let buildingList = state.buildingManager.managedStatePriorityList();

        // No buildings unlocked yet
        if (buildingList.length === 0) {
            return;
        }

        // Calculate the available power / resource rates of change that we have to work with
        let availablePower = resources.Power.currentQuantity;

        for (let i = 0; i < buildingList.length; i++) {
            let building = buildingList[i];

            availablePower += (building.powered * building.stateOnCount);

            for (let j = 0; j < building.consumption.length; j++) {
                let resourceType = building.consumption[j];

                // Fuel adjust
                let consumptionRate = resourceType.rate;
                if (building._tab === "space" && (resourceType.resource === resources.Oil || resourceType.resource === resources.Helium_3)) {
                    consumptionRate = game.fuel_adjust(consumptionRate);
                }
                if ((building._tab === "interstellar" || building._tab === "galaxy") && (resourceType.resource === resources.Deuterium || resourceType.resource === resources.Helium_3) && building !== state.spaceBuildings.AlphaFusion) {
                    consumptionRate = game.int_fuel_adjust(consumptionRate);
                }

                // Just like for power, get our total resources available
                resourceType.resource.rateOfChange += consumptionRate * building.stateOnCount;
            }
        }

        // Start assigning buildings from the top of our priority list to the bottom
        for (let i = 0; i < buildingList.length; i++) {
            let building = buildingList[i];

            let maxStateOn = building.count;

            if (building === state.spaceBuildings.NeutronCitadel) {
                while (maxStateOn > 0) {
                    if (availablePower >= (30 + (maxStateOn - 1) * 2.5) * maxStateOn * (game.global.race['emfield'] ? 1.5 : 1)) {
                        break;
                    } else {
                        maxStateOn--;
                    }
                }
            } else if (building.powered > 0) {
                maxStateOn = Math.min(maxStateOn, availablePower / building.powered)
            }

            // Max attractors configured by autoHell
            if (building === state.spaceBuildings.PortalAttractor && settings.autoHell && settings.hellHandleAttractors) {
                maxStateOn = Math.min(maxStateOn, state.warManager.hellAttractorMax);
                maxStateOn = Math.min(maxStateOn, building.stateOnCount + 1);
                maxStateOn = Math.max(maxStateOn, building.stateOnCount - 1);
            }

            // Disable tourist center with full money
            if (building === state.cityBuildings.TouristCenter && !game.global.race['ravenous'] && resources.Food.storageRatio < 0.7 && resources.Money.storageRatio > 0.98) {
                maxStateOn = Math.min(maxStateOn, state.cityBuildings.TouristCenter.stateOnCount - 1);
            }

            // Disable mills with surplus energy
            if (building === state.cityBuildings.Mill && building.powered && resources.Food.storageRatio < 0.7 && state.jobs.Farmer.count > 0) {
                maxStateOn = Math.min(maxStateOn, building.stateOnCount - ((resources.Power.currentQuantity - 5) / (-building.powered)));
            }

            for (let j = 0; j < building.consumption.length; j++) {
                let resourceType = building.consumption[j];

                // If resource rate is negative then we are gaining resources. So, only check if we are consuming resources
                if (resourceType.rate > 0) {

                    if (resourceType.resource === resources.Food) {
                        // Wendigo doesn't store food. Let's assume it's always available.
                        if (resourceType.resource.storageRatio > 0.1 || game.global.race['ravenous'] ) {
                            continue;
                        }
                    } else if (!resourceType.resource.isSupport() && resourceType.resource.storageRatio > 0.01) {
                        // If we have more than xx% of our storage then its ok to lose some resources.
                        // This check is mainly so that power producing buildings don't turn off when rate of change goes negative.
                        // That can cause massive loss of life if turning off space habitats :-)
                        continue;
                    }

                    maxStateOn = Math.min(maxStateOn, resourceType.resource.calculateRateOfChange({buy: true}) / resourceType.rate);
                }
            }

            // If this is a power producing structure then only turn off one at a time!
            if (building.powered < 0) {
                maxStateOn = Math.max(maxStateOn, building.stateOnCount - 1);
            }

            maxStateOn = Math.floor(maxStateOn);

            // Now when we know how many buildings we need - let's take resources
            for (let k = 0; k < building.consumption.length; k++) {
                let resourceType = building.consumption[k];

                // Fuel adjust
                let consumptionRate = resourceType.rate;
                if (building._tab === "space" && (resourceType.resource === resources.Oil || resourceType.resource === resources.Helium_3)) {
                    consumptionRate = game.fuel_adjust(consumptionRate);
                }
                if ((building._tab === "interstellar" || building._tab === "galaxy") && (resourceType.resource === resources.Deuterium || resourceType.resource === resources.Helium_3) && building !== state.spaceBuildings.AlphaFusion) {
                    consumptionRate = game.int_fuel_adjust(consumptionRate);
                }

                resourceType.resource.rateOfChange -= consumptionRate * maxStateOn;
            }

            building.tryAdjustState(maxStateOn - building.stateOnCount);
            availablePower -= building.powered * maxStateOn;
        }
        resources.Power.currentQuantity = availablePower;
        resources.Power.rateOfChange = availablePower;

        // Disable underpowered buildings, one at time. Unless it's ship - which may stay with warning until they'll get crew
        let warnBuildings = $("span.on.warn");
        for (let i = 0; i < warnBuildings.length; i++) {
            let building = buildingIds[warnBuildings[i].parentNode.id];
            if (building && !building.is.ship) {
                building.tryAdjustState(-1);
                break;
            }
        }
    }

    //#endregion Auto Power

    //#region Auto Trade Specials

    function autoStorage() {
        let m = state.storageManager;

        // Containers has not been unlocked in game yet (tech not researched)
        if (!m.initStorage()) {
            return;
        }

        let storageList = m.priorityList.filter(r => r.isUnlocked() && r.isManagedStorage());
        if (storageList.length === 0) {
            return;
        }

        let crateVolume = poly.crateValue();
        let containerVolume = poly.containerValue();
        if (!(crateVolume > 0 && containerVolume > 0)) {
            return;
        }
        let totalCrates = resources.Crates.currentQuantity;
        let totalContainers = resources.Containers.currentQuantity;
        let storageAdjustments = [];

        // Init storageAdjustments, we need to do it saparately, as loop below can jump to the and of array
        for (let i = 0; i < storageList.length; i++){
            storageAdjustments.push({resource: storageList[i], adjustCrates: 0, adjustContainers: 0, calculatedContainers: storageList[i].currentContainers, calculatedCrates: storageList[i].currentCrates});
        }

        let totalStorageMissing = 0;

        // Calculate storages
        for (let i = 0; i < storageList.length; i++){
            let resource = storageList[i];
            let cratesStorage = resource.currentCrates * crateVolume;
            let containersStorage = resource.currentContainers * containerVolume;
            let extraStorage = cratesStorage + containersStorage;
            let rawStorage = resource.maxQuantity - extraStorage;
            let freeStorage = resource.maxQuantity - resource.currentQuantity;
            let extraStorageRequired = resource.storageRequired - rawStorage;

            // If we're overflowing, and want to store more - just request one more crate volume
            if (resource.storeOverflow) {
                extraStorageRequired = Math.max(1, extraStorageRequired, resource.currentQuantity * 1.01 - rawStorage);
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
                freeStorage -= removedContainers * containerVolume;
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
                    let maxCratesToUnassign = resource.autoCratesMax - storageAdjustments[i].calculatedCrates;
                    let maxContainersToUnassign = resource.autoContainersMax - storageAdjustments[i].calculatedContainers;

                    for (let j = storageList.length-1; j > i; j--){
                        let otherFreeStorage = storageList[j].maxQuantity - storageList[j].currentQuantity;

                        // Unassign crates
                        if (maxCratesToUnassign > 0 && storageAdjustments[j].calculatedCrates > 0) {
                            let missingCrates = Math.ceil(missingStorage / crateVolume);
                            let cratesToUnassign = Math.min(storageAdjustments[j].calculatedCrates, missingCrates, maxCratesToUnassign);

                            if (settings.storageSafeReassign || storageList[j].storeOverflow) {
                                let emptyCrates = Math.floor(otherFreeStorage / containerVolume);
                                cratesToUnassign = Math.min(cratesToUnassign, emptyCrates);
                            }

                            storageAdjustments[j].adjustCrates -= cratesToUnassign;
                            storageAdjustments[j].calculatedCrates -= cratesToUnassign;
                            totalCrates += cratesToUnassign;
                            maxCratesToUnassign -= cratesToUnassign;
                            missingStorage -= cratesToUnassign * crateVolume;
                            otherFreeStorage -= cratesToUnassign * crateVolume;
                        }

                        // Unassign containers, if we still need them
                        if (maxContainersToUnassign > 0 && storageAdjustments[j].calculatedContainers > 0 && missingStorage > 0){
                            let missingContainers = Math.ceil(missingStorage / containerVolume);
                            let containersToUnassign = Math.min(storageAdjustments[j].calculatedContainers, missingContainers, maxContainersToUnassign);

                            if (settings.storageSafeReassign || storageList[j].storeOverflow) {
                                let emptyContainers = Math.floor(otherFreeStorage / containerVolume);
                                containersToUnassign = Math.min(containersToUnassign, emptyContainers);
                            }

                            storageAdjustments[j].adjustContainers -= containersToUnassign;
                            storageAdjustments[j].calculatedContainers -= containersToUnassign;
                            totalContainers += containersToUnassign;
                            maxContainersToUnassign -= containersToUnassign;
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

            if (settings.storageLimitPreMad && !game.global.race['cataclysm'] && !isResearchUnlocked("mad")) {
              // Only build pre-mad containers when steel storage is over 80%
              if (resources.Steel.storageRatio < 0.8) {
                  numberOfContainersWeCanBuild = 0;
              }
              // Only build pre-mad crates when already have Plywood for next level of library
              if (isLumberRace() && state.cityBuildings.Library.count < 20 && state.cityBuildings.Library.resourceRequirements.some(requirement => requirement.resource === resources.Plywood && requirement.quantity > resources.Plywood.currentQuantity) && (resources.Crates.maxQuantity !== state.cityBuildings.StorageYard.count * 10)) {
                  numberOfCratesWeCanBuild = 0;
              }
            }

            // Build crates
            let cratesToBuild = Math.min(numberOfCratesWeCanBuild, Math.ceil(totalStorageMissing / crateVolume));
            m.tryConstructCrate(cratesToBuild);

            resources.Crates.currentQuantity += cratesToBuild;
            resources.Crates.resourceRequirements.forEach(requirement =>
                requirement.resource.currentQuantity -= requirement.quantity * cratesToBuild
            );

            // And containers, if still needed
            totalStorageMissing -= cratesToBuild * crateVolume;
            if (totalStorageMissing > 0) {
                let containersToBuild = Math.min(numberOfContainersWeCanBuild, Math.ceil(totalStorageMissing / crateVolume));
                m.tryConstructContainer(containersToBuild);

                resources.Containers.currentQuantity += containersToBuild;
                resources.Containers.resourceRequirements.forEach(requirement =>
                    requirement.resource.currentQuantity -= requirement.quantity * containersToBuild
                );
            }
        }

        // Go to clicking, unassign first
        storageAdjustments.forEach(adjustment => {
            if (adjustment.adjustCrates < 0) {
                adjustment.resource.tryUnassignCrate(adjustment.adjustCrates * -1);
                adjustment.resource.maxQuantity -= adjustment.adjustCrates * -1 * crateVolume;
                resources.Crates.currentQuantity += adjustment.adjustCrates * -1;
            }
            if (adjustment.adjustContainers < 0) {
                adjustment.resource.tryUnassignContainer(adjustment.adjustContainers * -1);
                adjustment.resource.maxQuantity -= adjustment.adjustContainers * -1 * containerVolume;
                resources.Containers.currentQuantity += adjustment.adjustContainers * -1;
            }
        });

        // And now assign
        storageAdjustments.forEach(adjustment => {
            if (adjustment.adjustCrates > 0) {
                adjustment.resource.tryAssignCrate(adjustment.adjustCrates);
                adjustment.resource.maxQuantity += adjustment.adjustCrates * crateVolume;
                resources.Crates.currentQuantity -= adjustment.adjustCrates;
            }
            if (adjustment.adjustContainers > 0) {
                adjustment.resource.tryAssignContainer(adjustment.adjustContainers);
                adjustment.resource.maxQuantity += adjustment.adjustContainers * containerVolume;
                resources.Containers.currentQuantity -= adjustment.adjustContainers;
            }
        });
    }

    function autoMinorTrait() {
        let m = state.minorTraitManager;
        if (!m.isUnlocked()) {
            return;
        }

        let traitList = m.managedPriorityList();
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
                    m.buyTrait(trait.traitName);
                }
            }
        });
    }

    function adjustTradeRoutes() {
        let m = state.marketManager;
        let tradableResources = m.priorityList.filter(r => r.isMarketUnlocked() && (r.autoTradeBuyEnabled || r.autoTradeSellEnabled));
        let maxTradeRoutes = m.getMaxTradeRoutes();
        let tradeRoutesUsed = 0;
        let currentMoneyPerSecond = resources.Money.rateOfChange;
        let requiredTradeRoutes = [];
        let adjustmentTradeRoutes = [];
        let resourcesToTrade = [];

        let minimumAllowedMoneyPerSecond = Math.min(resources.Money.maxQuantity - resources.Money.currentQuantity, Math.max(settings.tradeRouteMinimumMoneyPerSecond, settings.tradeRouteMinimumMoneyPercentage / 100 * resources.Money.rateOfChange));

        // Fill trade routes with selling
        for (let i = 0; i < tradableResources.length; i++) {
            let resource = tradableResources[i];
            requiredTradeRoutes[i] = 0;
            if (tradeRoutesUsed < maxTradeRoutes && resource.autoTradeSellEnabled && resource.storageRatio > 0.99){
                let freeRoutes = maxTradeRoutes - tradeRoutesUsed;
                let routesToLimit = Math.floor((resource.rateOfChange - resource.autoTradeSellMinPerSecond) / resource.tradeRouteQuantity);
                let routesToAssign = Math.min(freeRoutes, routesToLimit);
                if (routesToAssign > 0){
                    tradeRoutesUsed += routesToAssign;
                    requiredTradeRoutes[i] -= routesToAssign;
                    currentMoneyPerSecond += resource.currentTradeRouteSellPrice * routesToAssign;
                }
            }
        }

        // Then for demanded resources
        for (let id in resources) {
            let resource = resources[id];
            if (resource.requestedQuantity > 0 && resource.isUnlocked() && resource.isTradable()) {
                // Calculate amount of routes we need
                let routes = Math.ceil(resource.requestedQuantity / resource.tradeRouteQuantity);

                // Add routes
                resourcesToTrade.push({
                    resource: resource,
                    requiredTradeRoutes: routes,
                    completed: false,
                    index: tradableResources.findIndex(tradeable => tradeable.id === resource.id),
                });
            }
        }

        // Drop minimum income, if we have something on demand, but can't trade with our income
        if (resourcesToTrade.length > 0) {
            if (minimumAllowedMoneyPerSecond > resources.Money.rateOfChange && resources.Money.requestedQuantity <= 0){
                minimumAllowedMoneyPerSecond = 0;
            }
        }

        // And now if have nothing on demand - initialize regular trades
        if (resourcesToTrade.length === 0 && resources.Money.requestedQuantity <= 0) {
            for (let i = 0; i < tradableResources.length; i++) {
                let resource = tradableResources[i];
                if (resource.autoTradeBuyEnabled && resource.autoTradeBuyRoutes > 0) {
                    resourcesToTrade.push( {
                        resource: resource,
                        requiredTradeRoutes: resource.autoTradeBuyRoutes,
                        completed: false,
                        index: tradableResources.findIndex(tradeable => tradeable.id === resource.id),
                    } );
                }
            }
        }

        while (resourcesToTrade.some(resource => !resource.completed)) {
            for (let i = 0; i < resourcesToTrade.length; i++) {
                const resourceToTrade = resourcesToTrade[i];
                //console.log(state.loopCounter + " " + resourceToTrade.resource.id + " testing...")

                // The resources is not currenlty unlocked or we've done all we can or we already have max storage so don't trade for more of it
                if (resourceToTrade.index === -1 || resourceToTrade.completed || resourceToTrade.resource.storageRatio > 0.99) {
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
        }
        // It does change rates of changes of resources, but we don't want to store this changes.
        // Sold resources can be easily reclaimed, and we want to be able to use it for production, ejecting, upkeep, etc, so let's pretend they're still here
        // And bought resources are dungerous to use - we don't want to end with negative income after recalculating trades
        resources.Money.rateOfChange = currentMoneyPerSecond;
    }

    //#endregion Auto Trade Specials

    function autoFleet() { // TODO: This thing is pretty horrible. Refactor me.
        if (!game.global.tech.piracy) {
            return;
        }

        let vue = getVueById("fleet");
        if (vue === undefined) {
            return;
        }

        // Init our current state
        let allRegions = [
            {name: "gxy_stargate", piracy: 0.1 * game.global.tech.piracy, armada: state.spaceBuildings.StargateDefensePlatform.stateOnCount * 20, useful: true},
            {name: "gxy_gateway", piracy: 0.1 * game.global.tech.piracy, armada: state.spaceBuildings.GatewayStarbase.stateOnCount * 25, useful: state.spaceBuildings.BologniumShip.stateOnCount > 0 && resources.Bolognium.storageRatio < 0.99},
            {name: "gxy_gorddon", piracy: 800, armada: 0, useful: state.spaceBuildings.GorddonFreighter.stateOnCount > 0},
            {name: "gxy_alien1", piracy: 1000, armada: 0, useful: state.spaceBuildings.Alien1VitreloyPlant.stateOnCount > 0 && resources.Vitreloy.storageRatio < 0.99},
            {name: "gxy_alien2", piracy: 2500, armada: state.spaceBuildings.Alien2Foothold.stateOnCount * 50 + state.spaceBuildings.Alien2ArmedMiner.stateOnCount * 5, useful: state.spaceBuildings.Alien2Scavenger.stateOnCount > 0 || (state.spaceBuildings.Alien2ArmedMiner.stateOnCount > 0 && (resources.Bolognium.storageRatio < 0.99 || resources.Adamantite.storageRatio < 0.99 || resources.Iridium.storageRatio < 0.99))},
            {name: "gxy_chthonian", piracy: 7500, armada: state.spaceBuildings.ChthonianMineLayer.stateOnCount * 50 + state.spaceBuildings.ChthonianRaider.stateOnCount * 12, useful: (state.spaceBuildings.ChthonianExcavator.stateOnCount > 0 && resources.Orichalcum.storageRatio < 0.99) || (state.spaceBuildings.ChthonianRaider.stateOnCount > 0 && (resources.Vitreloy.storageRatio < 0.99 || resources.Polymer.storageRatio < 0.99 || resources.Neutronium.storageRatio < 0.99 || resources.Deuterium.storageRatio < 0.99))},
        ];
        let allFleets = [
            {name: "scout_ship", count: state.spaceBuildings.ScoutShip.stateOnCount, power: game.actions.galaxy.gxy_gateway.scout_ship.ship.rating},
            {name: "corvette_ship", count: state.spaceBuildings.CorvetteShip.stateOnCount, power: game.actions.galaxy.gxy_gateway.corvette_ship.ship.rating},
            {name: "frigate_ship", count: state.spaceBuildings.FrigateShip.stateOnCount, power: game.actions.galaxy.gxy_gateway.frigate_ship.ship.rating},
            {name: "cruiser_ship", count: state.spaceBuildings.CruiserShip.stateOnCount, power: game.actions.galaxy.gxy_gateway.cruiser_ship.ship.rating},
            {name: "dreadnought", count: state.spaceBuildings.Dreadnought.stateOnCount, power: game.actions.galaxy.gxy_gateway.dreadnought.ship.rating},
        ];

        // Here we calculating min allowed coverage, if we have more ships than we can allocate without overflowing.
        let missingDef = allRegions.filter(region => region.useful && region.piracy - region.armada > 0).map(region => region.piracy - region.armada);
        for (let i = allFleets.length - 1; i >= 0; i--) {
            let ship = allFleets[i];
            let maxAllocate = missingDef.reduce((sum, def) => sum + Math.floor(def / ship.power), 0);
            if (ship.count > maxAllocate) {
                if (ship.count >= maxAllocate + missingDef.length) {
                    ship.cover = 0;
                } else {
                    let overflows = missingDef.map(def => def % ship.power).sort((a, b) => b - a);
                    ship.cover = overflows[ship.count - maxAllocate - 1];
                }
            } else {
                ship.cover = ship.power - 9.9;
            }
            if (ship.count >= maxAllocate) {
                missingDef.forEach((def, idx, arr) => arr[idx] = def % ship.power);
            }
        }
        for (let i = 0; i < allFleets.length; i++){
            if (allFleets[i].count > 0) {
                allFleets[i].cover = 0.1;
                break;
            }
        }


        // Init adjustment, and sort groups by priorities
        let priorityGroups = {};
        for (let i = 0; i < allRegions.length; i++) {
            let region = allRegions[i];
            if (region.useful) {
                region.weighting = settings["fleet_w_" + region.name];

                let priority = settings["fleet_p_" + region.name];
                priorityGroups[priority] = priorityGroups[priority] ?? [];
                priorityGroups[priority].push(region);
            }
            region.assigned = {};
            for (let j = 0; j < allFleets.length; j++) {
                region.assigned[allFleets[j].name] = 0;
            }
        }
        let priorityList = Object.keys(priorityGroups).sort((a, b) => b - a).map(key => priorityGroups[key]);
        let allFleet = allFleets.filter(ship => ship.count > 0);

        // Calculate amount of ships per zone
        for (let i = 0; i < priorityList.length && allFleets.length > 0; i++) {
            let regions = priorityList[i];
            while (allFleets.length > 0) {
                let totalPriorityWeight = regions.reduce((sum, region) => sum + region.weighting, 0);
                let shipsAssigned = 0;
                for (let k = allFleets.length - 1; k >= 0; k--) {
                    allFleets[k].init = allFleets[k].count;
                }
                for (let j = regions.length - 1; j >= 0; j--) {
                    let region = regions[j];
                    let missingDef = region.piracy - region.armada;
                    for (let k = allFleets.length - 1; k >= 0 && missingDef > 0; k--) {
                        let ship = allFleets[k];
                        if (ship.cover <= missingDef) {
                            let allowedShips = Math.min(ship.count, Math.floor(ship.init / totalPriorityWeight * region.weighting));
                            let shipsToAssign = Math.max(1, Math.min(allowedShips, Math.floor(missingDef / ship.power)));
                            if (shipsToAssign < allowedShips && shipsToAssign * ship.power + ship.cover <= missingDef) {
                                shipsToAssign++;
                            }
                            region.assigned[ship.name] += shipsToAssign;
                            region.armada += shipsToAssign * ship.power;
                            ship.count -= shipsToAssign;
                            missingDef -= shipsToAssign * ship.power;
                            shipsAssigned += shipsToAssign;
                        }
                        if (ship.count <= 0) {
                            allFleets.splice(k, 1);
                        }
                    }
                    if (missingDef <= 0) {
                        regions.splice(j, 1);
                    }
                }
                if (shipsAssigned < 1) {
                    break;
                }
            }
        }

        for (let i = 0; i < allRegions.length; i++) {
            let region = allRegions[i];
            for (let ship in region.assigned) {
                let shipsToAssign = region.assigned[ship];
                let deltaShip = region.assigned[ship] - game.global.galaxy.defense[region.name][ship];

                if (deltaShip < 0) {
                    state.multiplier.reset(deltaShip * -1);
                    while (state.multiplier.remainder > 0) {
                        state.multiplier.setMultiplier();
                        vue.sub(region.name, ship);
                    }
                }
            }
        }

        for (let i = 0; i < allRegions.length; i++) {
            let region = allRegions[i];
            for (let ship in region.assigned) {
                let shipsToAssign = region.assigned[ship];
                let deltaShip = region.assigned[ship] - game.global.galaxy.defense[region.name][ship];

                if (deltaShip > 0) {
                    state.multiplier.reset(deltaShip);
                    while (state.multiplier.remainder > 0) {
                        state.multiplier.setMultiplier();
                        vue.add(region.name, ship);
                    }
                }
            }
        }
    }

    //#region Main Loop

    function updateScriptData() {
        for (let id in resources) {
            resources[id].updateData();
        }

        // Money is special. They aren't defined as tradable, but still affected by trades
        if (settings.autoMarket) {
            let moneyDiff = game.breakdown.p.consume["Money"];
            if (moneyDiff.Trade){
                resources.Money.currentTradeDiff = moneyDiff.Trade;
                resources.Money.rateOfChange -= moneyDiff.Trade;
            }
        }

        // Add clicking to rate of change, so we can sell or eject it.
        if (settings.buildingAlwaysClick || (settings.autoBuild && (resources.Population.currentQuantity <= 15 || (state.cityBuildings.RockQuarry.count < 1 && !game.global.race['sappy'])))) {
            let resPerClick = getResourcesPerClick() / (game.global.settings.at > 0 ? 2 : 1) / (game.global.race['hyper'] ? 1.05 : 1) / (game.global.race['slow'] ? 0.9 : 1);
            if (state.cityBuildings.Food.isClickable()) {
                resources.Food.rateOfChange += resPerClick * settings.buildingClickPerTick * (game.global.tech['conjuring'] ? 10 : 1);
            }
            if (state.cityBuildings.Lumber.isClickable()) {
                resources.Lumber.rateOfChange += resPerClick * settings.buildingClickPerTick  * (game.global.tech['conjuring'] >= 2 ? 10 : 1);
            }
            if (state.cityBuildings.Stone.isClickable()) {
                resources.Stone.rateOfChange += resPerClick * settings.buildingClickPerTick  * (game.global.tech['conjuring'] >= 2 ? 10 : 1);
            }
            if (state.cityBuildings.Chrysotile.isClickable()) {
                resources.Chrysotile.rateOfChange += resPerClick * settings.buildingClickPerTick  * (game.global.tech['conjuring'] >= 2 ? 10 : 1);
            }
            if (state.cityBuildings.Slaughter.isClickable()){
                resources.Lumber.rateOfChange += resPerClick * settings.buildingClickPerTick;
                if (game.global.race['soul_eater'] && game.global.tech.primitive){
                    resources.Food.rateOfChange += resPerClick * settings.buildingClickPerTick;
                }
                if (resources.Furs.isUnlocked()) {
                    resources.Furs.rateOfChange += resPerClick * settings.buildingClickPerTick;
                }
            }
        }

        state.warManager.updateData();
        state.marketManager.updateData();
    }

    function calculateRequiredStorages() {
        // Reset required storage
        for (let id in resources) {
            resources[id].storageRequired = 0;
        }

        // Fuel for techs and missions
        state.oilRequiredByMissions = 0;
        state.heliumRequiredByMissions = 0;

        // Get list of all unlocked techs, and find biggest numbers for each resource
        // Required amount increased by 3% from actual numbers, as other logic of script can and will try to prevent overflowing by selling\ejecting\building projects, and that might cause an issues if we'd need 100% of storage
        $("#tech .action").each(function() {
            let research = techIds[this.id];
            research.updateResourceRequirements();
            research.resourceRequirements.forEach(requirement => {
                requirement.resource.storageRequired = Math.max(requirement.quantity*1.03, requirement.resource.storageRequired);
                if (requirement.resource === resources.Helium_3){
                    state.heliumRequiredByMissions = Math.max(requirement.quantity*1.03, state.heliumRequiredByMissions);
                }
                if (requirement.resource === resources.Oil){
                    state.oilRequiredByMissions = Math.max(requirement.quantity*1.03, state.oilRequiredByMissions);
                }
            });
        });

        // We need to preserve amount of knowledge required by techs only, while amount still not polluted
        // by buildings - wardenclyffe, labs, etc. This way we can determine what's our real demand is.
        // Otherwise they might start build up knowledge cap just to afford themselves, increasing required
        // cap further, so we'll need more labs, and they'll demand even more knowledge for next level and so on.
        state.knowledgeRequiredByTechs = resources.Knowledge.storageRequired;

        // Now we're checking costs of buildings
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
    }


    function prioritizeDemandedResources() {
        // Reset priority
        for (let id in resources) {
            resources[id].requestedQuantity = 0;
        }

        let prioritizedTasks = [];

        // Building and research queues
        if (settings.queueRequest) {
            prioritizedTasks = prioritizedTasks.concat(state.queuedTargets);
        }

        // Active triggers
        if (settings.triggerRequest) {
            prioritizedTasks = prioritizedTasks.concat(state.triggerTargets)
        }

        // Unlocked and affordable techs
        if (settings.researchRequest) {
            $("#tech .action:not(.cnam)").each(function() {
                let tech = techIds[this.id];
                if (tech) {
                    prioritizedTasks.push(tech);
                }
            });
        }

        if (prioritizedTasks.length > 0) {
            for (let i = 0; i < prioritizedTasks.length; i++){
                let demandedObject = prioritizedTasks[i];
                let costMod = demandedObject instanceof Project ? 0.01 : 1;
                for (let j = 0; j < demandedObject.resourceRequirements.length; j++) {
                    let req = demandedObject.resourceRequirements[j];
                    let resource = req.resource;
                    let required = req.quantity * costMod;
                    resource.requestedQuantity = Math.max(resource.requestedQuantity, required - resource.currentQuantity);
                }
            }
        }

        if (settings.missionRequest) {
            if (resources.Oil.currentQuantity < state.oilRequiredByMissions && resources.Oil.storageRatio < 0.98) {
                resources.Oil.requestedQuantity = Math.max(resources.Oil.requestedQuantity, state.oilRequiredByMissions - resources.Oil.currentQuantity);
            }
            if (resources.Helium_3.currentQuantity < state.heliumRequiredByMissions && resources.Helium_3.storageRatio < 0.98) {
                resources.Helium_3.requestedQuantity = Math.max(resources.Helium_3.requestedQuantity, state.heliumRequiredByMissions - resources.Helium_3.currentQuantity);
            }
        }

        // Prioritize material for craftables
        for (let id in resources) {
            let resource = resources[id];
            if (resource.requestedQuantity > 0) {
                // Only craftables stores their cost in resourceRequirements, no need for additional checks
                for (let i = 0; i < resource.resourceRequirements.length; i++) {
                    let material = resource.resourceRequirements[i].resource;
                    if (material.storageRatio < resource.preserve + 0.05) {
                        material.requestedQuantity = Math.max(material.requestedQuantity, material.maxQuantity * (resource.preserve + 0.05) - material.currentQuantity);
                    }
                }
            }
        }
    }

    function updateState() {
        if (game.global.race.species === "protoplasm") {
            state.goal = "Evolution";
        } else if (state.goal === "Evolution") {
            // Check what we got after evolution
            if (settings.autoEvolution && settings.evolutionBackup){
                let needReset = false;

                if (settings.userEvolutionTarget === "auto") {
                    let stars = game.alevel();
                    let newRace = races[game.global.race.species];

                    if (settings.prestigeType !== "bioseed" && newRace.isMadAchievementUnlocked(stars)) {
                        for (let j = 0; j < planetBiomeRaces[game.global.city.biome].length; j++) {
                            let race = planetBiomeRaces[game.global.city.biome][j];
                            if (!race.isMadAchievementUnlocked(stars)) {
                                state.log.logSuccess(loggingTypes.special, `${newRace.name} extinction achievement already earned, soft resetting and trying again.`);
                                needReset = true;
                                break;
                            }
                        }
                    }

                    if (settings.prestigeType === "bioseed" && newRace.isGreatnessAchievementUnlocked(stars)) {
                        let genus = game.races[planetBiomeRaces[game.global.city.biome][0]].type;
                        if (!race.isGreatnessAchievementUnlocked(stars)) {
                            state.log.logSuccess(loggingTypes.special, `${newRace.name} greatness achievement already earned, soft resetting and trying again.`);
                            needReset = true;
                        }
                    }
                } else if (settings.userEvolutionTarget !== game.global.race.species && races[settings.userEvolutionTarget].evolutionCondition()) {
                    state.log.logSuccess(loggingTypes.special, `Wrong race, soft resetting and trying again.`);
                    needReset = true;
                }

                if (needReset) {
                    // Let's double check it's actually *soft* reset
                    let resetButton = document.querySelector(".reset .button:not(.right)");
                    if (resetButton.querySelector(".tooltip-trigger").innerText === game.loc("reset_soft")) {
                        if (settings.evolutionQueueEnabled && settings.evolutionQueue.length > 0) {
                            addEvolutionSetting();
                            settings.evolutionQueue.unshift(settings.evolutionQueue.pop());
                        }
                        updateSettingsFromState();

                        state.goal = "GameOverMan";
                        resetButton.disabled = false;
                        resetButton.click();
                        return;
                    }
                }
            }
            state.goal = "Standard";
            updateTriggerSettingsContent(); // We've moved from evolution to standard play. There are technology descriptions that we couldn't update until now.
        }

        // TODO: Remove me once it's fixed in game
        if (($("#civics .garrison").length == 2) || // Workround for game bug dublicating of garrison and governmment div's after reset
            (state.spaceBuildings.BlackholeMassEjector.count > 0  && $('#resEjector').children().length === 0)) { // Same for bug with Ejector tab
            state.goal = "GameOverMan";
            setTimeout(()=> window.location.reload(), 5000);
        }

        updateScriptData();

        state.queuedTargets = [];
        // Buildings queue
        if (game.global.queue.display) {
            for (let i = 0; i < game.global.queue.queue.length; i++) {
                let id = game.global.queue.queue[i].id;
                let obj = buildingIds[id] || apraIds[id];
                if (obj && (obj instanceof Project || game.checkAffordable(obj.definition, true))) {
                    state.queuedTargets.push(obj);
                }
                if (!game.global.settings.qAny) {
                    break;
                }
            }
        }
        // Research queue
        if (game.global.r_queue.display) {
            for (let i = 0; i < game.global.r_queue.queue.length; i++) {
                let id = game.global.r_queue.queue[i].id;
                let obj = techIds[id];
                if (obj && game.checkAffordable(obj.definition, true)) {
                    state.queuedTargets.push(obj);
                }
                if (!game.global.settings.qAny) {
                    break;
                }
            }
        }

        state.triggerManager.resetTargetTriggers();

        state.triggerTargets = [];
        for (let i = 0; i < state.triggerManager.targetTriggers.length; i++) {
            let trigger = state.triggerManager.targetTriggers[i];
            if (trigger.actionType === "research" && techIds[trigger.actionId]) {
                state.triggerTargets.push(techIds[trigger.actionId]);
            }
            if (trigger.actionType === "build" && buildingIds[trigger.actionId]) {
                state.triggerTargets.push(buildingIds[trigger.actionId]);
            }
        }

        state.buildingManager.updateWeighting();
        state.buildingManager.updateResourceRequirements();
        state.projectManager.updateResourceRequirements();

        if (settings.minimumMoneyPercentage > 0) {
            state.minimumMoneyAllowed = resources.Money.maxQuantity * settings.minimumMoneyPercentage / 100;
        } else {
            state.minimumMoneyAllowed = settings.minimumMoney;
        }

        calculateRequiredStorages();
        prioritizeDemandedResources();

        // If our script opened a modal window but it is now closed (and the script didn't close it) then the user did so don't continue
        // with whatever our script was doing with the open modal window.
        if (state.windowManager.openedByScript && !state.windowManager.isOpenHtml()) {
            state.windowManager.resetWindowManager();
        }

        if (isDemonRace() && state.jobs.Lumberjack !== state.jobManager.unemployedJob) {
            state.jobs.Lumberjack.setJobOverride(state.jobManager.unemployedJob);
        }

        if (isHunterRace() && state.jobs.Farmer !== state.jobManager.unemployedJob) {
            state.jobs.Farmer.setJobOverride(state.jobManager.unemployedJob);
        }

        // This comes from the "const towerSize = (function(){" in portal.js in the game code
        let towerSize = 1000;
        if (game.global.hasOwnProperty('pillars')){
            Object.keys(game.global.pillars).forEach(pillar => {
                if (game.global.pillars[pillar]){
                    towerSize -= 12;
                }
            });
        }

        state.spaceBuildings.PortalEastTower.gameMax = towerSize;
        state.spaceBuildings.PortalWestTower.gameMax = towerSize;
    }

    function verifyGameActions() {
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
              () => state.spaceBuildings.PortalAncientPillars.isUnlocked(),
              (building) => building === state.spaceBuildings.PortalAncientPillars && (game.global.tech.pillars !== 1 || game.global.race.universe === 'micro'),
              () => "Locked",
              () => 0 // Pillars can't be activated in micro, and without tech.
          ],[
              () => game.global.race['magnificent'] && settings.buildingShrineType !== "any",
              (building) => {
                  if (building === state.cityBuildings.Shrine) {
                      let bonus = null;
                      if (game.global.city.calendar.moon > 0 && game.global.city.calendar.moon < 7){
                          bonus = "morale";
                      } else if (game.global.city.calendar.moon > 7 && game.global.city.calendar.moon < 14){
                          bonus = "metal";
                      } else if (game.global.city.calendar.moon > 14 && game.global.city.calendar.moon < 21){
                          bonus = "know";
                      } else if (game.global.city.calendar.moon > 21){
                          bonus = "tax";
                      } else {
                          return true;
                      }
                      if (settings.buildingShrineType === "equally") {
                          let minShrine = Math.min(game.global.city.shrine.morale, game.global.city.shrine.metal, game.global.city.shrine.know, game.global.city.shrine.tax);
                          return game.global.city.shrine[bonus] !== minShrine;
                      } else {
                          return settings.buildingShrineType !== bonus;
                      }
                  }
              },
              () => "Wrong shrine",
              () => 0 // Shrine
          ],[
              () => game.global.race['slaver'],
              (building) => {
                  if (building === state.cityBuildings.SlaveMarket) {
                      if (resources.Slave.currentQuantity >= resources.Slave.maxQuantity) {
                          return "Slave pens already full";
                      }
                      if (resources.Money.storageRatio < 0.9 && resources.Money.currentQuantity < 1000000){
                          return "Buying slaves only with excess money";
                      }
                  }
              },
              (note) => note,
              () => 0 // Slave Market
          ],[
              () => game.global.race['cannibalize'],
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
                          (!isLumberRace() || game.global.city.s_alter.harvest >= 3600)){
                          return "Sacrifice bonus already high enough";
                      }
                  }
              },
              (note) => note,
              () => 0 // Sacrificial Altar
          ],[
              () => true,
              (building) => getCostConflict(building),
              (result) => `Conflicts with ${result.target.title} for ${result.res.name} (${result.cause})`,
              () => settings.buildingWeightingTriggerConflict
          ],[
              () => true,
              (building) => building.getMissingSupply(),
              (supply) => supply.rate > 0 ?
                          `Missing ${supply.resource.name} to operate` :
                          `Provided ${supply.resource.name} not currently needed`,
              () => settings.buildingWeightingMissingSupply
          ],[
              () => true,
              (building) => building._tab === "city" && building !== state.cityBuildings.Mill && building.stateOffCount > 0,
              () => "Still have some non operating buildings",
              () => settings.buildingWeightingNonOperatingCity
          ],[
              () => true,
              (building) => building._tab !== "city" && building.stateOffCount > 0,
              () => "Still have some non operating buildings",
              () => settings.buildingWeightingNonOperating
          ],[
              () => settings.prestigeBioseedConstruct && settings.prestigeType !== "bioseed",
              (building) => building === state.spaceBuildings.GasSpaceDock || building === state.spaceBuildings.GasSpaceDockShipSegment || building === state.spaceBuildings.GasSpaceDockProbe,
              () => "Bioseed prestige disabled",
              () => 0
          ],[
              () => settings.prestigeBioseedConstruct && settings.prestigeType === "bioseed",
              (building) => building === state.spaceBuildings.DwarfWorldCollider,
              () => "Ignored on Bioseed runs",
              () => 0
          ],[
              () => settings.prestigeType === "mad" && (techIds['tech-mad'].isResearched() || game.checkAffordable(techIds['tech-mad'].definition, true)),
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
              (building) => building.powered < 0 && building !== state.cityBuildings.Mill,
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
              () => resources.Oil.maxQuantity < state.oilRequiredByMissions && state.cityBuildings.OilWell.count <= 0 && state.spaceBuildings.GasMoonOilExtractor.count <= 0,
              (building) => building === state.cityBuildings.OilWell,
              () => "Need more fuel",
              () => settings.buildingWeightingMissingFuel
          ],[
              () => resources.Helium_3.maxQuantity < state.heliumRequiredByMissions || resources.Oil.maxQuantity < state.oilRequiredByMissions,
              (building) => building === state.cityBuildings.OilDepot || building === state.spaceBuildings.SpacePropellantDepot || building === state.spaceBuildings.GasStorage,
              () => "Need more fuel",
              () => settings.buildingWeightingMissingFuel
        ]];
    }

    function initialiseScript() {
        for (let [key, action] of Object.entries(game.actions.tech)) {
            techIds[action.id] = new Technology(key);
        }

        // And for buildings popups
        for (let building of [...Object.values(state.cityBuildings), ...Object.values(state.spaceBuildings)]){
            buildingIds[building.settingId] = building;
        }

        for (let project of Object.values(state.projects)){
            apraIds[project._vueBinding] = project;
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
        resourcesByAtomicMass.sort((a, b) => b.resource.atomicMass - a.resource.atomicMass);
        // Elerium and infernite are always first as they are the exotic resources which are worth the most DE
        resourcesByAtomicMass.unshift({resource: resources.Infernite, requirement: 0});
        resourcesByAtomicMass.unshift({resource: resources.Elerium, requirement: 0});

        // Normal popups
        new MutationObserver(addTooltip).observe(document.querySelector("#main"), {childList: true});

        // Modal popups (Space Dock)
        new MutationObserver(mutations => mutations.forEach(mutation => mutation.addedNodes.forEach(node => node.nodeType === Node.ELEMENT_NODE && node.classList.contains("modal") && new MutationObserver(addTooltip).observe(node, {childList: true})))).observe(document.querySelector("body"), {childList: true});
    }

    function addTooltip(mutations) {
        if (!settings.autoBuild) {
            return;
        }
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                // "pop[id]" for normal buildings, "popq[id][order]" for queue
                let id = node.id.match(/\d$/) ? node.id.substr(4, node.id.length-5) : node.id.substr(3);
                let building = buildingIds[id];
                if (building && (building.autoBuildEnabled || building.weighting > 0)) {
                    node.style.pointerEvents = "none";
                    node.innerHTML += `<div>${building.extraDescription}</div>`;
                }
            });
        });
    }

    function automate() {
        // Exposed global it's a deepcopy of real game state, and it's not guaranteed to be actual
        // So, to ensure we won't process same state of game twice - we'll mark global at the end of the script tick, and wait for new one
        // Game ticks faster than script, so normally it's not an issue. But maybe game will be on pause, or lag badly - better be sure
        if (!state.scriptingEdition && game.global.warseed === Number.MAX_SAFE_INTEGER) { return; }

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

        if (state.goal === "GameOverMan"){ return; }

        if (state.goal === "Evolution") {
            if (settings.autoEvolution) {
                autoEvolution();
            }
            if (!state.scriptingEdition) { game.global.warseed = Number.MAX_SAFE_INTEGER; }
            return;
        }

        if (settings.autoStorage) {
            autoStorage(); // All changes cached
        }
        if (settings.buildingAlwaysClick || settings.autoBuild){
            autoGatherResources(); // All changes cached
        }
        if (settings.autoMarket) {
            autoMarket(); // Manual trading invalidates values of resources, change is random and can't be predicted, but we won't need values anymore
        }
        if (settings.autoResearch) {
            autoResearch(); // All changes cached
        }
        if (settings.autoHell) {
            autoHell(); // All changes cached
        }
        if (settings.autoFleet) {
            autoFleet(); // All changes cached
        }
        if (settings.autoGalaxyMarket) {
            autoGalaxyMarket(); // Can invalidate rateOfChange
        }
        if (settings.autoFactory) {
            autoFactory(); // Can invalidate rateOfChange
        }
        if (settings.autoMiningDroid) {
            autoMiningDroid(); // Can invalidate rateOfChange
        }
        if (settings.autoGraphenePlant) {
            autoGraphenePlant(); // Can invalidate rateOfChange
        }
        if (settings.autoQuarry) {
            autoQuarry(); // Can invalidate rateOfChange
        }
        if (settings.autoSmelter) {
            autoSmelter(); // Can invalidate rateOfChange
        }
        if (settings.autoJobs) {
            autoJobs(); // Can invalidates rateOfChange
        }
        if (settings.autoPower) {
            autoPower(); // Underpowering can invalidate count of powered buildings, and whatrever they're doing will be gone
        }
        if (settings.autoARPA) {
            autoArpa(); // Invalidates progress of constructed projects
        }
        if (settings.autoBuild) {
            autoBuild(); // Invalidates count of constructed buildings
        }
        if (settings.autoAssembleGene) {
            autoAssembleGene(); // Called after arpa, buildings, and research to not steal knowledge from them
        }
        if (settings.autoMinorTrait) {
            autoMinorTrait(); // Called after assemble gene to utilize new gene
        }
        if (settings.autoCraft) {
            autoCraft(); // Invalidates quantities of resources, missing exposed craftingRatio to calculate craft result on script side
        }
        if (settings.autoFight) {
            manageSpies(); // Can unoccupy foreign power in rare occasions, without caching back new status. Auto fight will check status once again, but such desync should not cause any harm
            autoBattle(); // Invalidates garrison, and adds unaccounted amount of resources after attack
        }
        if (settings.autoTax) {
            autoTax(); // Invalidaes rates of change(morale bonus), and tax income
        }
        if (settings.govManage) {
            manageGovernment(); // Governments gives bonuses and penalties to many different things, invalidating them
        }
        if (settings.prestigeWhiteholeEjectEnabled) {
            autoMassEjector(); // Purge remaining rateOfChange, should be called when it won't be needed anymore
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

        if (!state.scriptingEdition) { game.global.warseed = Number.MAX_SAFE_INTEGER; }
    }

    function mainAutoEvolveScript() {
        // This is a hack to check that the entire page has actually loaded. The queueColumn is one of the last bits of the DOM
        // so if it is there then we are good to go. Otherwise, wait a little longer for the page to load.
        if (document.getElementById("queueColumn") === null) {
            setTimeout(mainAutoEvolveScript, 100);
            return;
        }

        if (typeof unsafeWindow !== 'undefined') {
            win = unsafeWindow;
        } else {
            win = window;
        }

        game = win.evolve;
        if (!game) {
            alert("Please enable Debug Mode in settings, and refresh page.");
            return;
        }

        // poly.adjustCosts it's wrapper for firefox, with code to bypass script sandbox. If we're not on firefox - ignore it, and call real function instead
        if (typeof unsafeWindow === 'undefined') {
            poly.adjustCosts = game.adjustCosts;
        }

        if (!game.global?.race || !game.breakdown.p.consume) {
            setTimeout(mainAutoEvolveScript, 100);
            return;
        }

        if (!game.global.settings.tabLoad) {
            alert("Please enable Preload Tab Content in settings, and refresh page.");
            return;
        }

        if (document.title === "Evolve Scripting Edition") {
            // In Scripting Edition data don't need to be updated
            game.updateDebugData = () => true;
            // Exposed craftCost it's a function here, while in original game it's an object
            poly.craftCost = game.craftCost;

            state.scriptingEdition = true;
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
                position: absolute;
                top: 0;
                left: 0;
                cursor: default;
            }

            .ui-helper-hidden-accessible {
                border: 0;
                clip: rect(0 0 0 0);
                height: 1px;
                margin: -1px;
                overflow: hidden;
                padding: 0;
                position: absolute;
                width: 1px;
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

        let scriptContentNode = $('#script_settings');
        if (scriptContentNode.length !== 0) {
            return;
        }

        scriptContentNode = $('<div id="script_settings" style="margin-top: 30px;"></div>');
        let settingsNode = $(".settings");
        settingsNode.append(scriptContentNode);
        settingsNode.css("height", "calc(100vh - 5.8rem)");


        buildImportExport();
        buildPrestigeSettings(scriptContentNode, true);
        buildGeneralSettings();
        buildGovernmentSettings(scriptContentNode, true);
        buildEvolutionSettings();
        buildMinorTraitSettings();
        buildTriggerSettings();
        buildResearchSettings();
        buildWarSettings(scriptContentNode, true);
        buildHellSettings(scriptContentNode, true);
        buildFleetSettings();
        buildEjectorSettings();
        buildMarketSettings();
        buildStorageSettings();
        buildProductionSettings();
        buildJobSettings();
        buildBuildingSettings();
        buildWeightingSettings();
        buildProjectSettings();
        buildLoggingSettings(scriptContentNode, true);

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
                if (saveState && typeof saveState === "object" && (saveState.scriptName === "TMVictor" || $.isEmptyObject(saveState))) {
                    console.log("Importing script settings");
                    settings = saveState;
                    resetTriggerState()
                    resetJobState();
                    resetMarketState();
                    resetStorageState();
                    resetProjectState();
                    resetProductionState();
                    resetBuildingState();
                    resetMinorTraitState();
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

    function buildStandartLabel(note, color = "has-text-info") {
        return $(`<span class="${color}">${note}</span>`);
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

        addStandardSectionSettingsToggle(preTableNode, "triggerRequest", "Prioritize resources for triggers", "Readjust trade routes and production to resources required for active triggers");
        addStandardSectionSettingsToggle(preTableNode, "queueRequest", "Prioritize resources for queue", "Readjust trade routes and production to resources required for buildings and researches in queue");
        addStandardSectionSettingsToggle(preTableNode, "researchRequest", "Prioritize resources for researches", "Readjust trade routes and production to resources required for unlocked and affordable researches");
        addStandardSectionSettingsToggle(preTableNode, "missionRequest", "Prioritize resources for missions", "Readjust trade routes and production to resources required for unlocked and affordable missions");

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
                                        <option value = "none" title = "Endless game">None</option>
                                        <option value = "mad" title = "MAD prestige once MAD has been researched and all soldiers are home">Mutual Assured Destruction</option>
                                        <option value = "bioseed" title = "Launches the bioseeder ship to perform prestige when required probes have been constructed">Bioseed</option>
                                        <option value = "whitehole" title = "Infuses the blackhole with exotic materials to perform prestige">Whitehole</option>
                                        <option value = "ascension" title = "Allows research of Incorporeal Existence and Ascension. Ascension Machine managed by autoPower. User input still required to trigger reset, and create custom race.">Ascension</option>
                                      </select>
                                    </div>`);

        let typeSelectNode = $("#" + typeSelectNodeID);

        typeSelectNode.val(settings.prestigeType);
        typeSelectNode.on('change', function() {
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

        // MAD
        addStandardSectionHeader1(prestigeHeaderNode, "Mutual Assured Destruction");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeMADIgnoreArpa", "Pre-MAD: Ignore A.R.P.A.", "Disables building A.R.P.A. projects untill MAD is researched");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeMADWait", "Wait for maximum population", "Wait for maximum population and soldiers to maximize plasmids gain");

        // Bioseed
        addStandardSectionHeader1(prestigeHeaderNode, "Bioseed");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeBioseedConstruct", "Non-Bioseed: Ignore Space Dock, Bioseeder Ship and Probes<br>Bioseed: Ignore World Collider", "Construct the space dock, bioseeder ship segments and probes only when bioseed is current prestige goal, and skip building world collider");
        addStandardSectionSettingsNumber2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeBioseedProbes", "Required probes", "Required number of probes before launching bioseeder ship");

        // Whitehole
        addStandardSectionHeader1(prestigeHeaderNode, "Whitehole");
        addStandardSectionSettingsNumber2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeWhiteholeMinMass", "Required minimum solar mass", "Required minimum solar mass of blackhole before prestiging");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeWhiteholeStabiliseMass", "Stabilise blackhole until minimum solar mass reached", "Stabilises the blackhole with exotic materials until minimum solar mass is reached");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeWhiteholeEjectEnabled", "Enable mass ejector", "If not enabled the mass ejector will not be managed by the script");
        addStandardSectionSettingsToggle2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeWhiteholeEjectExcess", "Eject excess resources", "Eject resources above amount required for buildings, normally only resources with full storages will be ejected, until 'Eject everything' option is activated.");
        addStandardSectionSettingsNumber2(secondaryPrefix, prestigeHeaderNode, 0, "prestigeWhiteholeDecayRate", "(Decay Challenge) Eject rate", "Set amount of ejected resources up to this percent of decay rate, only useful during Decay Challenge");
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
        buildGovernmentSelectorSetting(secondaryPrefix, preTableNode, "govSpace", "Space Government", "Government for bioseed+. Chosen once you researched Quantum Manufacturing. Can be the same as above");

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
            settings[settingName] = this.value;
            updateSettingsFromState();

            if (secondaryPrefix !== "" && settings.showSettings) {
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
                                <option value = "none" title = "Wait for user selection">None</option>
                              </select>
                            </div>`);

        let selectNode = $('#script_userUniverseTargetName');

        universes.forEach(universeName => {
            selectNode.append('<option value = "' + universeName + '">' + universeName.charAt(0).toUpperCase() + universeName.slice(1) + '</option>');
        });
        selectNode.val(settings.userUniverseTargetName);

        selectNode.on('change', function() {
            settings.userUniverseTargetName = this.value;
            updateSettingsFromState();
        });

        // Target planet
        currentNode.append(`<div style="margin-top: 5px; width: 400px;">
                              <label for="script_userPlanetTargetName">Target Planet:</label>
                              <select id="script_userPlanetTargetName" style="width: 150px; float: right;">
                                <option value = "none" title = "Wait for user selection">None</option>
                                <option value = "habitable" title = "Picks most habitable planet, based on biome and trait">Most habitable</option>
                                <option value = "achieve" title = "Picks planet with most unearned achievements. Takes in account extinction achievements for planet exclusive races, and greatness achievements for planet biome, trait, and exclusive genus.">Most achievements</option>
                              </select>
                            </div>`);

        selectNode = $('#script_userPlanetTargetName');

        selectNode.val(settings.userPlanetTargetName);
        selectNode.on('change', function() {
            settings.userPlanetTargetName = this.value;
            updateSettingsFromState();
        });

        // Target evolution
        currentNode.append(`<div style="margin-top: 5px; width: 400px;">
                              <label for="script_userEvolutionTarget">Target Evolution:</label>
                              <select id="script_userEvolutionTarget" style="width: 150px; float: right;">
                                <option value = "auto" title = "Picks race with unearned Greatness achievement for bioseed runs, or with unearned Extinction achievement in other cases. Conditional races are prioritized, when available.">Auto Achievements</option>
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
            settings.userEvolutionTarget = this.value;
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

        addStandardSectionSettingsToggle(currentNode, "evolutionBackup", "Soft Reset", "Perform soft resets untill you'll get chosen race. Useless after getting mass exintion perk.");
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
        addStandardSectionSettingsToggle(currentNode, "challenge_junker", "Genetic Dead End", "Challenge mode - genetic dead end (Valdi)");

        addStandardHeading(currentNode, "Evolution Queue");
        addStandardSectionSettingsToggle(currentNode, "evolutionQueueEnabled", "Queue Enabled", "When enabled script with evolve with queued settings, from top to bottom. During that script settings will be overriden with settings stored in queue. Queued target will be removed from list after evolution.");

        currentNode.append(`<div style="margin-top: 5px; width: 400px;">
                              <label for="script_evolution_prestige">Prestige for new evolutions:</label>
                              <select id="script_evolution_prestige" style="text-align: right; height: 18px; width: 150px; float: right;">
                                <option value = "auto" title = "Inherited from current Prestige Settings">Current Prestige</option>
                                <option value = "none" title = "Endless game">None</option>
                                <option value = "mad" title = "MAD prestige once MAD has been researched and all soldiers are home">Mutual Assured Destruction</option>
                                <option value = "bioseed" title = "Launches the bioseeder ship to perform prestige when required probes have been constructed">Bioseed</option>
                                <option value = "whitehole" title = "Infuses the blackhole with exotic materials to perform prestige">Whitehole</option>
                                <option value = "ascension" title = "Allows research of Incorporeal Existence and Ascension. Ascension Machine managed by autoPower. User input still required to trigger reset, and create custom race.">Ascension</option>
                              </select>
                            </div>
                            <div style="margin-top: 10px;">
                              <button id="script_evlution_add" class="button">Add New Evolution</button>
                            </div>`);

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
            if (queuedEvolution.prestigeType === "bioseed") {
                raceName = "Auto Achievements (Greatness)";
            } else {
                raceName = "Auto Achievements (Extinction)";
            }
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

        let overridePrestige = $("#script_evolution_prestige").first().val();
        if (overridePrestige && overridePrestige !== "auto") {
            queuedEvolution.prestigeType = overridePrestige;
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
            newTableBodyText += '<tr id="script_trigger_' + trigger.seq + '" value="' + trigger.seq + '" class="script-draggable"><td style="width:16%"></td><td style="width:18%"></td><td style="width:11%"></td><td style="width:16%"></td><td style="width:18%"></td><td style="width:11%"></td><td style="width:5%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>';
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

        newTableBodyText += '<tr id="script_trigger_' + trigger.seq + '" value="' + trigger.seq + '" class="script-draggable"><td style="width:16%"></td><td style="width:18%"></td><td style="width:11%"></td><td style="width:16%"></td><td style="width:18%"></td><td style="width:11%"></td><td style="width:5%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>';

        tableBodyNode.append($(newTableBodyText));

        buildTriggerRequirementType(trigger);
        buildTriggerRequirementId(trigger);
        buildTriggerRequirementCount(trigger);

        buildTriggerActionType(trigger);
        buildTriggerActionId(trigger);
        buildTriggerActionCount(trigger);

        buildTriggerSettingsColumn(trigger);

        let content = document.querySelector('#script_triggerSettings .script-content');
        content.style.height = null;
        content.style.height = content.offsetHeight + "px"
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

            let content = document.querySelector('#script_triggerSettings .script-content');
            content.style.height = null;
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
                let typedTech = Object.values(techIds).find(technology => technology.title === this.value);
                if (typedTech !== undefined){
                    ui.item = {label: this.value, value: typedTech._vueBinding};
                }
            }

            // We have a tech to switch
            if (ui.item !== null && techIds.hasOwnProperty(ui.item.value)) {
                if (trigger[property] === ui.item.value) {
                    return;
                }

                trigger[property] = ui.item.value;
                trigger.complete = false;

                updateSettingsFromState();

                this.value = ui.item.label;
                return;
            }

            // No tech selected, don't change trigger, just restore old title in text field
            if (techIds.hasOwnProperty(trigger[property])) {
                this.value = techIds[trigger[property]].title;
                return;
            }
        };

        typeSelectNode.autocomplete({
            delay: 0,
            source: function(request, response) {
                let matcher = new RegExp($.ui.autocomplete.escapeRegex(request.term), "i" );
                let techList = [];
                Object.values(techIds).forEach(technology => {
                    let title = technology.title;
                    if(matcher.test(title)){
                        techList.push({label: title, value: technology._vueBinding});
                    }
                });
                response(techList);
            },
            select: onChange, // Dropdown list click
            focus: onChange, // Arrow keys press
            change: onChange // Keyboard type
        });

        if (techIds.hasOwnProperty(trigger[property])) {
            typeSelectNode.val(techIds[trigger[property]].title);
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

        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_researchPreTable"></div>');
        addStandardSectionSettingsToggle(preTableNode, "researchAlienGift", "Research Alien Gift", "Alien Gift increases piracy, you can disable auto research of it if you want to postpone that");

        // Theology 1
        currentNode.append(`<div style="margin-top: 5px; width: 400px">
                              <label for="script_userResearchTheology_1">Target Theology 1:</label>
                              <select id="script_userResearchTheology_1" style="width: 150px; float: right;">
                                <option value = "auto">Script Managed</option>
                                <option value = "tech-anthropology">Anthropology</option>
                                <option value = "tech-fanaticism">Fanaticism</option>
                              </select>
                            </div>`);

        let theology1Select = $('#script_userResearchTheology_1');
        theology1Select.val(settings.userResearchTheology_1);
        theology1Select.on('change', function() {
            settings.userResearchTheology_1 = this.value;
            updateSettingsFromState();
        });

        // Theology 2
        currentNode.append(`<div style="margin-top: 5px; width: 400px">
                              <label for="script_userResearchTheology_2">Target Theology 2:</label>
                              <select id="script_userResearchTheology_2" style="width: 150px; float: right;">
                                <option value = "auto">Script Managed</option>
                                <option value = "tech-study">Study</option>
                                <option value = "tech-deify">Deify</option>
                              </select>
                            </div>`);

        let theology2Select = $('#script_userResearchTheology_2');
        theology2Select.val(settings.userResearchTheology_2);
        theology2Select.on('change', function() {
            settings.userResearchTheology_2 = this.value;
            updateSettingsFromState();
        });

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildWarSettings(parentNode, isMainSettings) {
        let sectionId = "war";
        let sectionName = "Foreign Affairs";

        let resetFunction = function() {
            resetWarSettings();
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
        addStandardSectionSettingsToggle2(secondaryPrefix, foreignPowerNode, 0, "foreignOccupyLast", "Occupy last foreign power", "Occupy last foreign power once other two are subdued, and unification is researched. It will speed up unification. And even if you don't want to unify at all - disabled above checkbox, and just want to plunder enemies, this option still better to keep enabled. As a side effect it will prevent you from wasting money influencing and inciting last foreign power, and allow you to occupy it during looting with sieges, for additional production bonus. Disable it only if you want annex\\purchase achievements.");

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

        addStandardSectionSettingsNumber2(secondaryPrefix, currentNode, 0, "foreignMinAdvantage", "Minimum advantage", "Minimum advantage to launch campaign, ignored during ambushes");
        addStandardSectionSettingsNumber2(secondaryPrefix, currentNode, 0, "foreignMaxAdvantage", "Maximum advantage", "Once campaign is selected, your battalion will be limited in size down this advantage, reducing potential loses");
        addStandardSectionSettingsNumber2(secondaryPrefix, currentNode, 0, "foreignMaxSiegeBattalion", "Maximum siege battalion", "Maximum battalion for siege campaign. Only try to siege if it's possible with up to given amount of soldiers. Siege is expensive, if you'll be doing it with too big battalion it might be less profitable than other combat campaigns. This option not applied for unification, it's only for regular looting.");

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildStandartSettingsSelector2(secondaryPrefix, parentNode, settingName, displayName, hintText, optionsList) {
        let computedSelectId = `script_${secondaryPrefix}${settingName}`;
        let mainSelectId = `script_${settingName}`;

        parentNode.append(`<div style="margin-top: 5px; display: inline-block; width: 80%; text-align: left;">
                              <label title="${hintText}" for="${computedSelectId}">${displayName}:</label>
                              <select id="${computedSelectId}" style="width: 150px; float: right;">
                              </select>
                            </div>`);

        let selectNode = $('#' + computedSelectId);

        for (let i = 0; i < optionsList.length; i++) {
            selectNode.append(`<option value="${optionsList[i]}"}>${optionsList[i]}</option>`);
        }

        selectNode.val(settings[settingName]);
        selectNode.on('change', function() {
            settings[settingName] = this.value;
            updateSettingsFromState();

            if (secondaryPrefix !== "" && settings.showSettings) {
                document.getElementById(mainSelectId).value = this.value;
            }
        });
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

    function buildFleetSettings() {
        let sectionId = "fleet";
        let sectionName = "Fleet";

        let resetFunction = function() {
            resetFleetSettings();
            updateSettingsFromState();
            updateFleetSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateFleetSettingsContent);
    }

    var galaxyRegions = ["gxy_stargate", "gxy_gateway", "gxy_gorddon", "gxy_alien1", "gxy_alien2", "gxy_chthonian"];
    function updateFleetSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_fleetContent');
        currentNode.empty().off("*");

        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_fleetPreTable"></div>');

        // Add table
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:35%">Region</th><th class="has-text-warning" style="width:20%"></th><th class="has-text-warning" style="width:20%">Weighting</th><th class="has-text-warning" style="width:20%">Priority</th><th class="has-text-warning" style="width:5%"></th></tr>
                <tbody id="script_fleetTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_fleetTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < galaxyRegions.length; i++) {
            newTableBodyText += '<tr value="' + galaxyRegions[i] + '"><td id="script_fleet_' + galaxyRegions[i] + '" style="width:35%"><td style="width:20%"></td><td style="width:20%"></td></td><td style="width:20%"></td><td style="width:5%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < galaxyRegions.length; i++) {
            let fleetElement = $('#script_fleet_' + galaxyRegions[i]);

            let nameRef = galaxyRegions[i] === "gxy_alien1" ? "Alien 1 System" : galaxyRegions[i] === "gxy_alien2" ? "Alien 2 System" : game.actions.galaxy[galaxyRegions[i]].info.name;

            fleetElement.append(buildStandartLabel(typeof nameRef === "function" ? nameRef() : nameRef));

            fleetElement = fleetElement.next().next();
            fleetElement.append(buildStandartSettingsInput(settings, "fleet_w_" + galaxyRegions[i], "fleet_w_" + galaxyRegions[i]));

            fleetElement = fleetElement.next();
            fleetElement.append(buildStandartSettingsInput(settings, "fleet_p_" + galaxyRegions[i], "fleet_p_" + galaxyRegions[i]));
        }

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function resetFleetSettings() {
        for (let i = 0; i < galaxyRegions.length; i++) {
            settings["fleet_w_" + galaxyRegions[i]] = 1;
            settings["fleet_p_" + galaxyRegions[i]] = galaxyRegions.length - i;
        }
    }

    function buildEjectorSettings() {
        let sectionId = "ejector";
        let sectionName = "Mass Ejector";

        let resetFunction = function() {
            resetEjectorState();
            updateSettingsFromState();
            updateEjectorSettingsContent();

            // Redraw toggles on market tab
            if ( $('.ea-eject-toggle').length !== 0 ) {
                createEjectToggles();
            }
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateEjectorSettingsContent);
    }

    function updateEjectorSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_ejectorContent');
        currentNode.empty().off("*");

        // Add table
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:35%">Resource</th><th class="has-text-warning" style="width:45%">Atomic Mass</th><th class="has-text-warning" style="width:20%">Allow Eject</th></tr>
                <tbody id="script_ejectorTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_ejectorTableBody');
        let newTableBodyText = "";

        for (let id in resources) {
            let resource = resources[id];
            if (resource.isEjectable()) {
                newTableBodyText += '<tr value="' + resource.id + '"><td id="script_eject_' + resource.id + 'Toggle" style="width:35%"></td><td style="width:45%"></td><td style="width:20%"></td></tr>';
            }
        }

        tableBodyNode.append($(newTableBodyText));

        for (let i = 0; i < resourcesByAtomicMass.length; i++) {
            let resource = resourcesByAtomicMass[i].resource;
            let ejectElement = $('#script_eject_' + resource.id + 'Toggle');

            ejectElement.append(buildEjectorLabel(resource));

            ejectElement = ejectElement.next();
            ejectElement.append(`<span class="mass">Mass per unit: <span class="has-text-warning">${resource.atomicMass}</span> kt</span>`);

            ejectElement = ejectElement.next();
            ejectElement.append(buildStandartSettingsToggle(resource, "ejectEnabled", "script_eject2_" + resource.id, "script_eject1_" + resource.id));
        }

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildEjectorLabel(resource) {
        let color = "has-text-info";
        if (resource === resources.Elerium || resource === resources.Infernite) {
            color = "has-text-caution";
        } else if (resource.isCraftable()) {
            color = "has-text-danger";
        } else if (!resource.isTradable()) {
            color = "has-text-advanced";
        }

        return $(`<span class="${color}">${resource.name}</span>`);
    }

    function resetEjectorState() {
        for (let i = 0; i < resourcesByAtomicMass.length; i++) {
            let resource = resourcesByAtomicMass[i].resource;
            resource.ejectEnabled = resource.isTradable();
        }
        resources.Elerium.ejectEnabled = true;
        resources.Infernite.ejectEnabled = true;
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
            newTableBodyText += '<tr value="' + resource.id + '" class="script-draggable"><td id="script_market_' + resource.id + 'Toggle" style="width:15%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:5%"></td></tr>';
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

        // Add any pre table settings
        preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_marketGalaxyPreTable"></div>');
        addStandardHeading(preTableNode, "Galaxy Trades");
        addStandardSectionSettingsToggle(preTableNode, "autoGalaxyMarket", "Manage Galaxy Trades", "Automatically adjust galaxy trade routes");

        // Add table
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:30%">Buy</th><th class="has-text-warning" style="width:30%">Sell</th><th class="has-text-warning" style="width:20%">Weighting</th><th class="has-text-warning" style="width:20%">Priority</th></tr>
                <tbody id="script_marketGalaxyTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        tableBodyNode = $('#script_marketGalaxyTableBody');
        newTableBodyText = "";

        for (let i = 0; i < poly.galaxyOffers.length; i++) {
            newTableBodyText += '<tr value="' + i + '"><td id="script_market_galaxy_' + i + '" style="width:30%"><td style="width:30%"></td></td><td style="width:20%"></td><td style="width:20%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < poly.galaxyOffers.length; i++) {
            let trade = poly.galaxyOffers[i];
            let buyResource = resources[trade.buy.res];
            let sellResource = resources[trade.sell.res];
            let marketElement = $('#script_market_galaxy_' + i);

            marketElement.append(buildStandartLabel(buyResource.name, "has-text-success"));

            marketElement = marketElement.next();
            marketElement.append(buildStandartLabel(sellResource.name, "has-text-danger"));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsInput(buyResource, "res_galaxy_w_" + buyResource.id, "galaxyMarketWeighting"));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsInput(buyResource, "res_galaxy_p_" + buyResource.id, "galaxyMarketPriority"));
       }

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
            newTableBodyText += '<tr value="' + resource.id + '" class="script-draggable"><td id="script_storage_' + resource.id + 'Toggle" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>';
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
            newTableBodyText += '<tr value="' + trait.traitName + '" class="script-draggable"><td id="script_minorTrait_' + trait.traitName + 'Toggle" style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:40%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other minorTraits settings rows
        for (let i = 0; i < state.minorTraitManager.priorityList.length; i++) {
            const trait = state.minorTraitManager.priorityList[i];
            let minorTraitElement = $('#script_minorTrait_' + trait.traitName + 'Toggle');

            let toggle = $(`<span title="${game.loc("trait_"+trait.traitName)}" class="has-text-info" style="margin-left: 20px;">${game.loc("trait_"+trait.traitName+"_name")}</span>`);
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
        updateProductionTableFoundry(currentNode);
        updateProductionTableFactory(currentNode);
        updateProductionTableMiningDrone(currentNode);

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function updateProductionTableSmelter(currentNode) {
        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_productionPreTableSmelter"></div>');
        addStandardHeading(preTableNode, "Smelter");

        preTableNode.append(`<div style="margin-top: 5px; width: 400px;">
                              <label for="script_productionSmelting">Distributing:</label>
                              <select id="script_productionSmelting" style="width: 200px; float: right;">
                                <option value = "iron">Prioritize Iron</option>
                                <option value = "steel">Prioritize Steel</option>
                                <option value = "storage">Both, up to full storages</option>
                                <option value = "required">Both, up to required amounts</option>
                              </select>
                            </div>`);

        let selectNode = $('#script_productionSmelting');

        selectNode.val(settings.productionSmelting);
        selectNode.on('change', function() {
            settings.productionSmelting = this.value;
            updateSettingsFromState();
        });

        // Add table
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:35%">Fuel</th><th class="has-text-warning" style="width:65%"></th></tr>
                <tbody id="script_productionTableBodySmelter" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_productionTableBodySmelter');
        let newTableBodyText = "";

        let smelterFuels = state.cityBuildings.Smelter.fuelPriorityList();

        for (let i = 0; i < smelterFuels.length; i++) {
            const fuel = smelterFuels[i];
            newTableBodyText += '<tr value="' + fuel.id + '"><td id="script_smelter_' + fuel.id + '" style="width:35%"></td><td style="width:65%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < smelterFuels.length; i++) {
            const fuel = smelterFuels[i];
            let productionElement = $('#script_smelter_' + fuel.id);

            productionElement.append(buildStandartLabel(fuel.id));

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

                let smelterFuels = Object.values(state.cityBuildings.Smelter.Fuels);
                for (let i = 0; i < fuelIds.length; i++) {
                    smelterFuels.find(fuel => fuel.id === fuelIds[i]).priority = i;
                }

                updateSettingsFromState();
            },
        } );
    }

    function updateProductionTableFactory(currentNode) {
        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_productionPreTableFactory"></div>');
        addStandardHeading(preTableNode, "Factory");

        // Add table
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:35%">Resource</th><th class="has-text-warning" style="width:20%">Enabled</th><th class="has-text-warning" style="width:20%">Weighting</th><th class="has-text-warning" style="width:20%">Priority</th><th class="has-text-warning" style="width:5%"></th></tr>
                <tbody id="script_productionTableBodyFactory" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_productionTableBodyFactory');
        let newTableBodyText = "";

        let productionSettings = Object.values(state.cityBuildings.Factory.Productions);

        for (let i = 0; i < productionSettings.length; i++) {
            const production = productionSettings[i];
            newTableBodyText += '<tr value="' + production.resource.id + '"><td id="script_factory_' + production.resource.id + 'Toggle" style="width:35%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:5%"></td></tr>';
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

            productionElement = productionElement.next();
            productionElement.append(buildStandartSettingsInput(production, "production_p_" + production.resource.id, "priority"));
        }
    }

    function updateProductionTableFoundry(currentNode) {
        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_productionPreTableFoundry"></div>');
        addStandardHeading(preTableNode, "Foundry");
        addStandardSectionSettingsToggle(preTableNode, "productionPrioritizeDemanded", "Prioritize demanded craftables", "Resources already produced above maximum amount required for constructing buildings won't be crafted, if there's better options enabled and available, ignoring weighted ratio");

        // Add table
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:35%">Resource</th><th class="has-text-warning" style="width:20%">Enabled</th><th class="has-text-warning" style="width:20%">Weighting</th><th class="has-text-warning" style="width:20%">Min Ingredients</th><th class="has-text-warning" style="width:5%"></th></tr>
                <tbody id="script_productionTableBodyFoundry" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_productionTableBodyFoundry');
        let newTableBodyText = "";

        for (let i = 0; i < state.craftableResourceList.length; i++) {
            const resource = state.craftableResourceList[i];
            newTableBodyText += '<tr value="' + resource.id + '"><td id="script_foundry_' + resource.id + 'Toggle" style="width:35%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:5%"></td></tr>';
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
            if (resource == resources.Scarletite) {
                productionElement.append('<span>Managed</span>');
            } else {
                productionElement.append(buildStandartSettingsInput(resource, "foundry_w_" + resource.id, "weighting"));
            }

            productionElement = productionElement.next();
            productionElement.append(buildStandartSettingsInput(resource, "foundry_p_" + resource.id, "preserve"));
        }
    }

    function updateProductionTableMiningDrone(currentNode) {
        // Add any pre table settings
        let preTableNode = currentNode.append('<div style="margin-top: 10px; margin-bottom: 10px;" id="script_productionPreTableMiningDrone"></div>');
        addStandardHeading(preTableNode, "Mining Drone");

        // Add table
        currentNode.append(
            `<table style="width:100%"><tr><th class="has-text-warning" style="width:35%">Resource</th><th class="has-text-warning" style="width:20%"></th><th class="has-text-warning" style="width:20%">Weighting</th><th class="has-text-warning" style="width:20%">Priority</th><th class="has-text-warning" style="width:5%"></th></tr>
                <tbody id="script_productionTableBodyMiningDrone" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_productionTableBodyMiningDrone');
        let newTableBodyText = "";

        let droidProducts = Object.values(state.spaceBuildings.AlphaMiningDroid.Productions);

        for (let i = 0; i < droidProducts.length; i++) {
            const production = droidProducts[i];
            newTableBodyText += '<tr value="' + production.resource.id + '"><td id="script_droid_' + production.resource.id + '" style="width:35%"><td style="width:20%"></td><td style="width:20%"></td></td><td style="width:20%"></td><td style="width:5%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < droidProducts.length; i++) {
            const production = droidProducts[i];
            let productionElement = $('#script_droid_' + production.resource.id);

            productionElement.append(buildStandartLabel(production.resource.name));

            productionElement = productionElement.next().next();
            productionElement.append(buildStandartSettingsInput(production, "droid_w_" + production.resource.id, "weighting"));
            
            productionElement = productionElement.next();
            productionElement.append(buildStandartSettingsInput(production, "droid_pr_" + production.resource.id, "priority"));
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
        addWeighingRule(tableBodyNode, "All fuel depots", "Missing Oil or Helium for techs and missions", "buildingWeightingMissingFuel");
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

        currentNode.append(`<div style="margin-top: 5px; width: 400px;">
                              <label for="script_buildingShrineType">Prefered Shrine:</label>
                              <select id="script_buildingShrineType" style="width: 150px; float: right;">
                                <option value = "any">Any</option>
                                <option value = "equally">Equally</option>
                                <option value = "morale">Morale</option>
                                <option value = "metal">Metal</option>
                                <option value = "know">Knowledge</option>
                                <option value = "tax">Tax</option>
                              </select>
                            </div>`);

        let selectNode = $('#script_buildingShrineType');

        selectNode.val(settings.buildingShrineType);
        selectNode.on('change', function() {
            settings.buildingShrineType = this.value;
            updateSettingsFromState();
        });

        // Add table
        currentNode.append(
            `<div><input id="script_buildingSearch" class="script-searchsettings" type="text" placeholder="Search for buildings.."></div>
            <table style="width:100%"><tr><th class="has-text-warning" style="width:35%">Building</th><th class="has-text-warning" style="width:15%">Auto Build</th><th class="has-text-warning" style="width:15%">Max Build</th><th class="has-text-warning" style="width:15%">Weighting</th><th class="has-text-warning" style="width:20%">Auto Power</th></tr>
                <tbody id="script_buildingTableBody" class="script-contenttbody"></tbody>
            </table>`
        );

        let tableBodyNode = $('#script_buildingTableBody');

        $("#script_buildingSearch").on("keyup", filterBuildingSettingsTable); // Add building filter

        // Add in a first row for switching "All"
        let newTableBodyText = '<tr value="All" class="unsortable"><td id="script_bldallToggle" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:20%"></td></tr>';

        for (let i = 0; i < state.buildingManager.priorityList.length; i++) {
            let building = state.buildingManager.priorityList[i];
            newTableBodyText += '<tr value="' + building.settingId + '" class="script-draggable"><td id="script_' + building.settingId + 'Toggle" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:20%"></td></tr>';
        }
        tableBodyNode.append($(newTableBodyText));

        // Build special "All Buildings" top row
        let buildingElement = $('#script_bldallToggle');
        buildingElement.append('<span class="has-text-warning" style="margin-left: 20px;">All Buildings</span>');

        // enabled column
        buildingElement = buildingElement.next();
        buildingElement.append(buildAllBuildingEnabledSettingsToggle(state.buildingManager.priorityList));

        // state column
        buildingElement = buildingElement.next().next().next();
        buildingElement.append(buildAllBuildingStateSettingsToggle(state.buildingManager.priorityList));

        // Build all other buildings settings rows
        for (let i = 0; i < state.buildingManager.priorityList.length; i++) {
            let building = state.buildingManager.priorityList[i];
            let buildingElement = $('#script_' + building.settingId + 'Toggle');

            buildingElement.append(buildBuildingLabel(building));

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

    function buildBuildingLabel(building) {
        let color = "has-text-info";
        if (building._tab === "space" || building._tab === "starDock") {
            color = "has-text-danger";
        } else if (building._tab === "galaxy") {
            color = "has-text-advanced";
        } else if (building._tab === "interstellar") {
            color = "has-text-special";
        } else if (building._tab === "portal") {
            color = "has-text-warning";
        }

        return $(`<span class="${color}">${building.name}</span>`);
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

        if (building.isSwitchable()) {
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
            newTableBodyText += '<tr value="' + project.id + '" class="script-draggable"><td id="script_' + project.id + 'Toggle" style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td></tr>';
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
        let toggle = $(`<label tabindex="0" class="switch" id="${name}" title="${title}"><input type="checkbox" value="${settings[name]}"${checked}/> <span class="check"></span><span>${name}</span></label></br>`);
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

            createSettingToggle(scriptNode, 'autoEvolution', 'Runs through the evolution part of the game through to founding a settlement. In Auto Achievements mode will target races that you don\'t have extinction\\greatness achievements for yet.');
            createSettingToggle(scriptNode, 'autoFight', 'Sends troops to battle whenever Soldiers are full and there are no wounded. Adds to your offensive battalion and switches attack type when offensive rating is greater than the rating cutoff for that attack type.');
            createSettingToggle(scriptNode, 'autoHell', 'Sends soldiers to hell and sends them out on patrols. Adjusts maximum number of powered attractors based on threat.');
            createSettingToggle(scriptNode, 'autoFleet', 'Manages Andromeda fleet to supress piracy');
            createSettingToggle(scriptNode, 'autoTax', 'Adjusts tax rates if your current morale is greater than your maximum allowed morale. Will always keep morale above 100%.');
            createSettingToggle(scriptNode, 'autoCraft', 'Craft when a specified crafting ratio is met. This changes throughout the game - lower in the beginning and rising as the game progresses.', createCraftToggles, removeCraftToggles);
            createSettingToggle(scriptNode, 'autoBuild', 'Builds city and space building when it can an production allows (eg. Won\'t build a Fission Reactor if you don\'t have enough uranium production).', createBuildingToggles, removeBuildingToggles);
            createSettingToggle(scriptNode, 'autoPower', 'Manages power based on a priority order of buildings. Starts with city based building then space based.');
            createSettingToggle(scriptNode, 'autoStorage', 'Assigns crates to allow storage of resources.');
            createSettingToggle(scriptNode, 'autoMarket', 'Allows for automatic buying and selling of resources once specific ratios are met. Also allows setting up trade routes until a minimum specified money per second is reached. The will trade in and out in an attempt to maximise your trade routes.', createMarketToggles, removeMarketToggles);
            createSettingToggle(scriptNode, 'autoResearch', 'Performs research when minimum requirements are met. ');
            createSettingToggle(scriptNode, 'autoARPA', 'Builds ARPA projects if user enables them to be built.', createArpaToggles, removeArpaToggles);
            createSettingToggle(scriptNode, 'autoJobs', 'Assigns jobs in a priority order with multiple breakpoints. Starts with a few jobs each and works up from there. Will try to put a minimum number on lumber / stone then fill up capped jobs first.');
            createSettingToggle(scriptNode, 'autoCraftsmen', 'Enable this and autoJobs will also manage craftsmen.');
            createSettingToggle(scriptNode, 'autoQuarry', 'Manages rock quarry stone to chrysotile ratio for smoldering races');
            createSettingToggle(scriptNode, 'autoSmelter', 'Manages smelter output at different stages at the game.');
            createSettingToggle(scriptNode, 'autoFactory', 'Manages factory production based on power and consumption. Produces alloys as a priority until nano-tubes then produces those as a priority.');
            createSettingToggle(scriptNode, 'autoMiningDroid', 'Manages mining droid production.');
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
            bulkSell.on('mouseup', function() {
                updateScriptData();
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
        if (settings.autoMarket && $('.ea-market-toggle').length === 0 && isMarketUnlocked()) {
            createMarketToggles();
        }
        if (settings.prestigeWhiteholeEjectEnabled && $('.ea-eject-toggle').length === 0 && state.spaceBuildings.BlackholeMassEjector.count > 0) {
            createEjectToggles();
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
            let otherCheckbox = document.querySelector('#script_arpa2_' + project.id + ' input');
            if (otherCheckbox !== null) {
                otherCheckbox.checked = state;
            }
            updateSettingsFromState();
        });
    }

    function createArpaToggles() {
        removeArpaToggles();
        for (let key in state.projects) {
            let project = state.projects[key];
            if (project.isUnlocked()) {
                createArpaToggle(project);
            }
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

    function createEjectToggles() {
        removeEjectToggles();

        $('#eject').append('<span id="script_eject_top_row" style="margin-left: auto; margin-right: 0.2rem;" class="has-text-danger">Auto Eject</span>');
        for (let i = 0; i < resourcesByAtomicMass.length; i++) {
            let resource = resourcesByAtomicMass[i].resource;
            if (resource.isUnlocked()) {
                let ejectRow = $('#eject' + resource.id);
                let ejectChecked = resource.ejectEnabled ? " checked" : "";
                let toggleEject = $('<label id="script_eject1_' +  resource.id + '" tabindex="0" title="Enable ejecting of this resource. When to eject is set in the Prestige Settings tab."  class="switch ea-eject-toggle" style="margin-left: auto; margin-right: 0.2rem;"><input type="checkbox"' + ejectChecked + '> <span class="check" style="height:5px;"></span><span class="state"></span></label>');
                ejectRow.append(toggleEject);

                toggleEject.on('change', function(e) {
                    let input = e.currentTarget.children[0];
                    resource.ejectEnabled = input.checked;
                    let otherCheckbox = document.querySelector('#script_eject2_' + resource.id + ' input');
                    if (otherCheckbox !== null) {
                        otherCheckbox.checked = input.checked;
                    }
                    updateSettingsFromState();
                });
            }
        }
    }

    function removeEjectToggles() {
        $('.ea-eject-toggle').remove();
        $("#script_eject_top_row").remove();
    }

    /**
     * @param {Resource} resource
     */
    function createMarketToggle(resource) {
        let marketRow = $('<span class="ea-market-toggle" style="margin-left: auto; margin-right: 0.2rem; float:right;"></span>').appendTo('#market-' + resource.id);

        if (!game.global.race['no_trade']) {
            let autoBuyChecked = resource.autoBuyEnabled ? " checked" : "";
            let autoSellChecked = resource.autoSellEnabled ? " checked" : "";
            let toggleBuy = $('<label id="script_buy1_' +  resource.id + '" tabindex="0" title="Enable buying of this resource. When to buy is set in the Settings tab."  class="switch"><input type="checkbox"' + autoBuyChecked + '> <span class="check" style="height:5px;"></span><span class="state"></span></label>');
            let toggleSell = $('<label id="script_sell1_' +  resource.id + '" tabindex="0" title="Enable selling of this resource. When to sell is set in the Settings tab."  class="switch"><input type="checkbox"' + autoSellChecked + '> <span class="check" style="height:5px;"></span><span class="state"></span></label>');
            marketRow.append(toggleBuy);
            marketRow.append(toggleSell);

            toggleBuy.on('change', function(e) {
                let state = e.currentTarget.children[0].checked;
                resource.autoBuyEnabled = state;
                let otherCheckbox = document.querySelector('#script_buy2_' + resource.id + ' input');
                if (otherCheckbox !== null) {
                    otherCheckbox.checked = state;
                }
                updateSettingsFromState();
            });

            toggleSell.on('change', function(e) {
                let state = e.currentTarget.children[0].checked;
                resource.autoSellEnabled = state;
                let otherCheckbox = document.querySelector('#script_sell2_' + resource.id + ' input');
                if (otherCheckbox !== null) {
                    otherCheckbox.checked = state;
                }
                updateSettingsFromState();
            });
        }

        let autoTradeBuyChecked = resource.autoTradeBuyEnabled ? " checked" : "";
        let autoTradeSellChecked = resource.autoTradeSellEnabled ? " checked" : "";
        let toggleTradeFor = $('<label id="script_tbuy1_' +  resource.id + '" tabindex="0" title="Enable trading for this resource. Max routes is set in the Settings tab." class="switch"><input type="checkbox"' + autoTradeBuyChecked + '> <span class="check" style="height:5px;"></span><span class="state"></span></label>');
        let toggleTradeAway = $('<label id="script_tsell1_' +  resource.id + '" tabindex="0" title="Enable trading this resource away. Min income is set in the Settings tab." class="switch"><input type="checkbox"' + autoTradeSellChecked + '> <span class="check" style="height:5px;"></span><span class="state"></span></label>');
        marketRow.append(toggleTradeFor);
        marketRow.append(toggleTradeAway);

        toggleTradeFor.on('change', function(e) {
            let state = e.currentTarget.children[0].checked;
            resource.autoTradeBuyEnabled = state;
            let otherCheckbox = document.querySelector('#script_tbuy2_' + resource.id + ' input');
            if (otherCheckbox !== null) {
                otherCheckbox.checked = state;
            }
            updateSettingsFromState();
        });

        toggleTradeAway.on('change', function(e) {
            let state = e.currentTarget.children[0].checked;
            resource.autoTradeSellEnabled = state;
            let otherCheckbox = document.querySelector('#script_tsell2_' + resource.id + ' input');
            if (otherCheckbox !== null) {
                otherCheckbox.checked = state;
            }
            updateSettingsFromState();
        });
    }

    function createMarketToggles() {
        removeMarketToggles();

        if (!game.global.race['no_trade']) {
            $("#market .market-item[id] .res").width("5rem");
            $("#market .market-item[id] .buy span").text("B");
            $("#market .market-item[id] .sell span").text("S");
            $("#market .market-item[id] .trade > :first-child").text("R");
            $("#market .trade .zero").text("x");
        }

        $("#market-qty").after(`<div class="market-item vb" id="script_market_top_row" style="overflow:hidden">
                                  <span style="margin-left: auto; margin-right: 0.2rem; float:right;">
   ${!game.global.race['no_trade']?'<span class="has-text-success" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">Buy</span>\
                                    <span class="has-text-danger" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">Sell</span>':''}
                                    <span class="has-text-warning" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">In</span>
                                    <span class="has-text-warning" style="width: 2.75rem; display: inline-block; text-align: center;">Away</span>
                                  </span>
                                </div>`);

        for (let i = 0; i < state.marketManager.priorityList.length; i++) {
            createMarketToggle(state.marketManager.priorityList[i]);
        }
    }

    function removeMarketToggles() {
        $('.ea-market-toggle').remove();
        $("#script_market_top_row").remove();

        if (!game.global.race['no_trade']) {
            $("#market .market-item[id] .res").width("7.5rem");
            $("#market .market-item[id] .buy span").text("BUY");
            $("#market .market-item[id] .sell span").text("SELL");
            $("#market .market-item[id] .trade > :first-child").text("Routes:");
            $("#market .trade .zero").text("Cancel Routes");
        }
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
        return game.global.race['carnivore'] || game.global.race['soul_eater'];
    }

    function isDemonRace() {
        return game.global.race['soul_eater'] && game.global.race.species !== 'wendigo';
    }

    function isLumberRace() {
        return !game.global.race['kindling_kindred'] && !game.global.race['smoldering'];
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
        // This function is full of hacks. But all that can be accomplished by wise player without peeking inside game variables
        // We really need to know power as accurate as possible, otherwise script becomes wonky when spies dies on mission
        let govProp = "gov" + govIndex;
        if (game.global.civic.foreign[govProp].spy > 0) {
            // With 2+ spies we know exact number, for 1 we're assuming trick with advantage
            // We can see ambush advantage with a single spy, and knowing advantage we can calculate power
            // Proof of concept: military_power = army_offence / (5 / (1-advantage))
            // I'm not going to waste time parsing tooltips, and take that from internal variable instead
            return game.global.civic.foreign[govProp].mil;
        } else {
            // We're going to use another trick here. We know minimum and maximum power for gov
            // If current power is below minimum, that means we sabotaged it already, but spy died since that
            // We know we seen it for sure, so let's just peek inside, imitating memory
            // We could cache those values, but making it persistent in between of page reloads would be a pain
            // Especially considering that player can not only reset, but also import different save at any moment
            let minPower = [75, 125, 200];
            let maxPower = [125, 175, 300];

            if (game.global.civic.foreign[govProp].mil < minPower[govIndex]) {
                return game.global.civic.foreign[govProp].mil;
            } else {
                // Above minimum. Even if we ever sabotaged it, unfortunately we can't prove it. Not peeking inside, and assuming worst.
                return maxPower[govIndex];
            }
        }
    }

    function getGovArmy(tactic, govIndex) { // function battleAssessment(gov)
        let enemy = 0;
        switch(tactic){
            case 0:
                enemy = 5;
                break;
            case 1:
                enemy = 27.5;
                break;
            case 2:
                enemy = 62.5;
                break;
            case 3:
                enemy = 125;
                break;
            case 4:
                enemy = 300;
                break;
        }
        return enemy * getGovPower(govIndex) / 100;
    }

    function getAdvantage(army, tactic, govIndex) {
        return (1 - (getGovArmy(tactic, govIndex) / army)) * 100;
    }

    function getRatingForAdvantage(adv, tactic, govIndex) {
        return getGovArmy(tactic, govIndex) / (1 - (adv/100));
    }

    function removePoppers() {
        let poppers = document.querySelectorAll('[id^="pop"]'); // popspace_ and // popspc

        for (let i = 0; i < poppers.length; i++) {
            poppers[i].remove();
        }
    }

    /**
     * @param {string} elementId Id of the element that the vue is bound to
     */
    function getVueById(elementId) {
        let element = win.document.getElementById(elementId);
        if (element === null) {
            return undefined;
        }

        if (!element.__vue__) {
            return undefined;
        }

        return element.__vue__;
    }

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

    // Recursively traverse through object, wrapping all functions in getters
    function normalizeProperties(object, proto = []) {
        for (let key in object) {
            if (typeof object[key] === "object" && (object[key].constructor === Object || object[key].constructor === Array || proto.indexOf(object[key].constructor) !== -1)) {
                object[key] = normalizeProperties(object[key], proto);
            }
            if (typeof object[key] === "function") {
                let fn = object[key].bind(object);
                Object.defineProperty(object, key, {configurable: true, enumerable: true, get: () => fn()});
            }
        }
        return object;
    }

    //#endregion Utility Functions

    var poly = {
    // Taken directly from game code(v1.0.26) with no functional changes, and minimified:
        // export function arpaAdjustCosts(costs) from arpa.js
        arpaAdjustCosts: function(t){return t=function(r){if(game.global.race.creative){var n={};return Object.keys(r).forEach(function(t){n[t]=function(){return.8*r[t]()}}),n}return r}(t),poly.adjustCosts(t)},
        // function govPrice(gov) from civics.js
        govPrice: function(e){let i=game.global.civic.foreign[e],o=15384*i.eco;return o*=1+1.6*i.hstl/100,+(o*=1-.25*i.unrest/100).toFixed(0)},
        // export const galaxyOffers from resources.js
        galaxyOffers: normalizeProperties([{buy:{res:"Deuterium",vol:5},sell:{res:"Helium_3",vol:25}},{buy:{res:"Neutronium",vol:2.5},sell:{res:"Copper",vol:200}},{buy:{res:"Adamantite",vol:3},sell:{res:"Iron",vol:300}},{buy:{res:"Elerium",vol:1},sell:{res:"Oil",vol:125}},{buy:{res:"Nano_Tube",vol:10},sell:{res:"Titanium",vol:20}},{buy:{res:"Graphene",vol:25},sell:{res:()=>game.global.race.kindling_kindred||game.global.race.smoldering?game.global.race.smoldering?"Chrysotile":"Stone":"Lumber",vol:1e3}},{buy:{res:"Stanene",vol:40},sell:{res:"Aluminium",vol:800}},{buy:{res:"Bolognium",vol:.75},sell:{res:"Uranium",vol:4}},{buy:{res:"Vitreloy",vol:1},sell:{res:"Infernite",vol:1}}]),

    // Reimplemented:
        // export function crateValue() from Evolve/src/resources.js
        crateValue: () => Number(getVueById("createHead").buildCrateDesc().match(/(\d+)/g)[1]),
        // export function containerValue() from Evolve/src/resources.js
        containerValue: () => Number(getVueById("createHead").buildContainerDesc().match(/(\d+)/g)[1]),

    // Scripting Edition compatibility:
        craftCost: () => game.craftCost,

    // Firefox compatibility:
        adjustCosts: (cost, wiki) => game.adjustCosts(cloneInto(cost, unsafeWindow, {cloneFunctions: true}), wiki)
    };

    $().ready(mainAutoEvolveScript);

})($);
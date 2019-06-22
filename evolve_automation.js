// ==UserScript==
// @name         Evolve
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       Fafnir
// @author       TMVictor
// @match        https://pmotschmann.github.io/Evolve/
// @grant        none
// @require      https://code.jquery.com/jquery-3.3.1.min.js
// ==/UserScript==

//@ts-check
(function($) {
    'use strict';
    var settings = {};
    var jsonSettings = localStorage.getItem('settings');
    if (jsonSettings !== null) {
        settings = JSON.parse(jsonSettings);
    }

    //#region Class Declarations

    class Action {
        /**
         * @param {string} tabPrefix
         * @param {string} id
         * @param {boolean} isBuilding
         */
        constructor(tabPrefix, id, isBuilding) {
            this._tabPrefix = tabPrefix;
            this._id = id;
            this._elementId = this._tabPrefix + "-" + this.id;
            this._isBuilding = isBuilding;
            this.autoBuildEnabled = true;

            this.consumption = {
                power: 0,

                /** @type {{ resource: Resource, initialRate: number, rate: number, }[]} */
                resourceTypes: [],
            };

            /** @type {Resource[]} */
            this.requiredResourcesToAction = [];

            /** @type {Resource[]} */
            this.requiredBasicResourcesToAction = [];
        }

        //#region Standard actions

        get id() {
            return this._id;
        }
        
        isUnlocked() {
            return document.getElementById(this._elementId) !== null;
        }

        isBuilding() {
            return this._isBuilding;
        }

        // Whether the container is clickable is determined by it's node class
        // - class="action" - the node is available for clicking
        // - class="action cna" - Not clickable right now (eg. you don't have enough resources)
        // - calss="action cnam" - not clickable as you don't meet the requirements (eg. you don't have enough storage)
        isClickable() {
            if (!this.isUnlocked()) {
                return false;
            }

            let containerNode = document.getElementById(this._elementId);
            
            if (containerNode.classList.contains("cna")) { return false; }
            if (containerNode.classList.contains("cnam")) { return false; }

            // There are a couple of special buildings that are "clickable" but really aren't clickable. Lets check them here
            if (this.id === "star_dock") {
                // Only clickable once but then hangs around in a "clickable" state even though you can't get more than one...
                return this.count === 0;
            } else if (this.id === "spcdock-seeder") {
                // Only clickable 100 times but then hangs around in a "clickable" state even though you can't get more than 100...
                return this.count < 100;
            } else if (this.id === "world_collider") {
                // Only clickable 1859 times but then hangs around in a "clickable" state even though you can't get more than 1859...
                return this.count < 1859;
            }
            
            return true;
        }
        
        // This is a "safe" click. It will only click if the container is currently clickable.
        // ie. it won't bypass the interface and click the node if it isn't clickable in the UI.
        click() {
            if (!this.isClickable()) {
                return false
            }
            
            let containerNode = document.getElementById(this._elementId);
            let mainClickNode = containerNode.getElementsByTagName("a")[0];
            
            // Click it real good
            if (mainClickNode !== null) {
                mainClickNode.click();
                return true;
            }
            
            return false;
        }

        /**
         * @param {number} rate
         */
        addPowerConsumption(rate) {
            this.consumption.power = rate;
        }

        /**
         * @param {Resource} resource
         * @param {number} rate
         */
        addResourceConsumption(resource, rate) {
            this.consumption.resourceTypes.push({ resource: resource, initialRate: rate, rate: rate });
        }

        /**
         * @param {Resource} resource
         */
        addRequiredResource(resource) {
            this.requiredResourcesToAction.push(resource);
        }

        //#endregion Standard actions

        //#region Buildings

        hasCount() {
            if (!this.isUnlocked()) {
                return false;
            }

            let containerNode = document.getElementById(this._elementId);
            return containerNode.querySelector(' .button .count') !== null;
        }
        
        get count() {
            if (!this.hasCount()) {
                return 0;
            }

            let containerNode = document.getElementById(this._elementId);
            return parseInt(containerNode.querySelector(' .button .count').textContent);
        }
        
        hasState() {
            if (!this.isUnlocked()) {
                return false;
            }

            // If there is an "on" state count node then there is state
            let containerNode = document.getElementById(this._elementId);
            return containerNode.querySelector(' .on') !== null;
        }
        
        get stateOnCount() {
            if (!this.hasState()) {
                return 0;
            }
            
            let containerNode = document.getElementById(this._elementId);
            return parseInt(containerNode.querySelector(' .on').textContent);
        }
        
        get stateOffCount() {
            if (!this.hasState()) {
                return 0;
            }
            
            let containerNode = document.getElementById(this._elementId);
            return parseInt(containerNode.querySelector(' .off').textContent);
        }

        isStateOnWarning() {
            if (!this.hasState()) {
                return false;
            }

            if (this.stateOnCount === 0) {
                return false;
            }
            
            let containerNode = document.getElementById(this._elementId);
            return containerNode.querySelector(' .warn') !== null;
        }
        
        // Make the click a little more meaningful for a building
        tryBuild() {
            return this.click();
        }

        /**
         * @param {number} adjustCount
         */
        tryAdjustState(adjustCount) {
            if (!this.hasState() || adjustCount === 0) {
                return false;
            }

            let containerNode = document.getElementById(this._elementId);
            
            if (adjustCount > 0) {
                let onNode = containerNode.querySelector(' .on');

                for (let i = 0; i < adjustCount; i++) {
                    // @ts-ignore
                    onNode.click();
                }

                return;
            }

            if (adjustCount < 0) {
                let offNode = containerNode.querySelector(' .off');
                adjustCount = adjustCount * -1;

                for (let i = 0; i < adjustCount; i++) {
                    // @ts-ignore
                    offNode.click();
                }

                return;
            }
        }
        
        trySetStateOn() {
            if (!this.hasState()) {
                return false;
            }
            
            let containerNode = document.getElementById(this._elementId);
            // @ts-ignore
            containerNode.querySelector(' .on').click();
        }
        
        trySetStateOff() {
            if (!this.hasState()) {
                return false;
            }
            
            let containerNode = document.getElementById(this._elementId);
            // @ts-ignore
            containerNode.querySelector(' .off').click();
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

    class Resource {
        /**
         * @param {string} prefix
         * @param {string} id
         * @param {boolean} isTradable
         * @param {number} buyRatio
         * @param {number} sellRatio
         * @param {boolean} isCraftable
         * @param {number} craftRatio
         */
        constructor(prefix, id, isTradable, buyRatio, sellRatio, isCraftable, craftRatio) {
            this._prefix = prefix;
            this._id = id;
            this._isPopulation = (id === "Population"); // We can't store the full elementId because we don't know the name of the population node until later
            this.autoCraftEnabled = true;

            this._isTradable = isTradable;
            this.autoBuyEnabled = false;
            this.autoSellEnabled = false;
            this.buyRatio = buyRatio;
            this.sellRatio = sellRatio;

            this.isAssignedCratesUpdated = false;
            this.assignedCrates = 0;
            this.isAssignedContainersUpdated = false;
            this.assignedContainers = 0;
            this.lastConstructStorageAttemptLoopCounter = 0;

            this._isCraftable = isCraftable;
            this.craftRatio = craftRatio;

            this.calculatedRateOfChange = 0;

            /** @type {Action[]} */
            this.usedInBuildings = [];

            /** @type {Resource[]} */
            this.requiredResourcesToAction = [];

            /** @type {ResourceProductionCost[]} */
            this.productionCost = [];
        }

        //#region Standard resource

        get id() {
            // The population node is special and its id is actually the race name rather than a static name
            if (!this._isPopulation) {
                return this._id;
            }

            return getRaceName();
        }
        
        isUnlocked() {
            let containerNode = document.getElementById(this._prefix + this.id);
            return containerNode !== null && containerNode.style.display !== "none";
        }

        hasOptions() {
            // Options is currently the + button for accessing crates and containers
            if (!this.isUnlocked()) {
                return false;
            }

            return document.getElementById("con" + this.id) !== null;
        }

        isTradable() {
            return this._isTradable;
        }

        isCraftable() {
            return this._isCraftable;
        }

        get currentQuantity() {
            if (!this.isUnlocked()) {
                return 0;
            }

            let storageNode = document.getElementById("cnt" + this.id);

            if (storageNode !== null) {
                // 2 possibilities:
                // eg. "3124.16" the current quantity is 3124.16
                // eg. in "1234 / 10.2K" the current quantity is 1234
                if (storageNode.textContent.indexOf("/") === -1) {
                    return getRealNumber(storageNode.textContent);
                }

                return getRealNumber(storageNode.textContent.split(" / ")[0]);
            }

            // If storage node is null then it might be plasmids which doesn't have the id...
            let countNode = document.querySelector("#" + this._prefix + this.id + " .count");
            if (countNode !== null) {
                return parseInt(countNode.textContent);
            }

            // No idea!
            return 0;
        }

        get maxQuantity() {
            if (!this.isUnlocked()) {
                return 0;
            }

            let storageNode = document.getElementById("cnt" + this.id);

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

            let rateOfChangeNode = document.getElementById("inc" + this.id);

            // There is no rate of change for this resource
            if (rateOfChangeNode === null) {
                return 0;
            }

            // eg. "11.6K /s" the rate of change is 11600
            return getRealNumber(rateOfChangeNode.textContent.split(' /s')[0]);
        }

        //#endregion Standard resource

        //#region Basic resource

        isOptionsOpen() {
            if (!this.hasOptions()) {
                return;
            }

            return (state.modal.isOpen() && state.modal.currentModalWindowTitle === this.id);
        }
        
        openOptions() {
            if (!this.hasOptions()) {
                return;
            }
            
            let optionsNode = document.getElementById("con" + this.id);
            state.modal.openModalWindow();
            optionsNode.click();
        }

        updateOptions() {
            // We can only update options when the options window is open
            if (!this.isOptionsOpen()) {
                return false;
            }

            // eg. "Crates Assigned: 100"
            let assignedCratesNode = document.querySelector('#modalCrates .crateHead > span:nth-child(2)');
            this.isAssignedCratesUpdated = true;
            if (assignedCratesNode !== null) {
                this.assignedCrates = parseInt(assignedCratesNode.textContent.substring(17));
            } else {
                this.assignedCrates = 0;
            }

            // eg. "Containers Assigned: 0"
            let assignedContainersNode = document.querySelector('#modalContainers .crateHead > span:nth-child(2)');
            this.isAssignedContainersUpdated = true;
            if (assignedContainersNode !== null) {
                this.assignedContainers = parseInt(assignedContainersNode.textContent.substring(21));
            } else {
                this.assignedContainers = 0;
            }

            return true;
        }

        tryConstructCrate() {
            // We can only construct a crate when the options window is open
            if (!this.isOptionsOpen()) {
                return false;
            }

            let crateButtons = document.querySelectorAll('#modalCrates .button');
            for (let i = 0; i < crateButtons.length; i++) {
                if (crateButtons[i].textContent === "Construct Crate") {
                    // @ts-ignore
                    crateButtons[i].click();
                    return true;
                }
            }

            return false;
        }

        tryAssignCrate() {
            // We can only assign a crate when the options window is open
            if (!this.isOptionsOpen()) {
                return false;
            }

            let crateButtons = document.querySelectorAll('#modalCrates .button');
            for (let i = 0; i < crateButtons.length; i++) {
                if (crateButtons[i].textContent === "Assign Crate") {
                    // @ts-ignore
                    crateButtons[i].click();
                    return true;
                }
            }

            return false;
        }

        tryUnassignCrate() {
            // We can only unassign a crate when the options window is open
            if (!this.isOptionsOpen()) {
                return false;
            }

            let crateButtons = document.querySelectorAll('#modalCrates .button');
            for (let i = 0; i < crateButtons.length; i++) {
                if (crateButtons[i].textContent === "Unassign Crate") {
                    // @ts-ignore
                    crateButtons[i].click();
                    return true;
                }
            }

            return false;
        }

        tryConstructContainer() {
            // We can only construct a container when the options window is open
            if (!this.isOptionsOpen()) {
                return false;
            }

            let containerButtons = document.querySelectorAll('#modalContainers .button');
            for (let i = 0; i < containerButtons.length; i++) {
                if (containerButtons[i].textContent === "Construct Container") {
                    // @ts-ignore
                    containerButtons[i].click();
                    return true;
                }
            }

            return false;
        }

        tryAssignContainer() {
            // We can only assign a container when the options window is open
            if (!this.isOptionsOpen()) {
                return false;
            }

            let containerButtons = document.querySelectorAll('#modalContainers .button');
            for (let i = 0; i < containerButtons.length; i++) {
                if (containerButtons[i].textContent === "Assign Container") {
                    // @ts-ignore
                    containerButtons[i].click();
                    return true;
                }
            }

            return false;
        }

        tryUnassignContainer() {
            // We can only unassign a container when the options window is open
            if (!this.isOptionsOpen()) {
                return false;
            }

            let containerButtons = document.querySelectorAll('#modalContainers .button');
            for (let i = 0; i < containerButtons.length; i++) {
                if (containerButtons[i].textContent === "Unassign Container") {
                    // @ts-ignore
                    containerButtons[i].click();
                    return true;
                }
            }

            return false;
        }

        //#endregion Basic resource

        //#region Craftable resource

        /**
         * @param {string} toCraft
         */
        tryCraftX(toCraft) {
            if (!this.isUnlocked()) {
                return false
            }

            // Get the required clickable craft node and if we find it, clilck it
            let craftClickNode = document.getElementById("inc" + this.id + toCraft).getElementsByTagName("a")[0];

            if (craftClickNode !== null) {
                craftClickNode.click();
                return true;
            }
            
            return false;
        }

        //#endregion Craftable resource
    }

    class Power extends Resource {
        // This isn't really a resource but we're going to make a dummy one so that we can treat it like a resource
        constructor() {
            super("", "powerMeter", false, -1, -1, false, -1);
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

            return parseInt(document.getElementById("powerMeter").textContent);
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

        //#region Basic resource

        isOptionsOpen() {
            return false;
        }
        
        openOptions() {
            return;
        }

        updateOptions() {
            return false;
        }

        tryConstructCrate() {
            return false;
        }

        tryAssignCrate() {
            return false;
        }

        tryUnassignCrate() {
            return false;
        }

        tryConstructContainer() {
            return false;
        }

        tryAssignContainer() {
            return false;
        }

        tryUnassignContainer() {
            return false;
        }

        //#endregion Basic resource

        //#region Craftable resource

        /**
         * @param {string} toCraft
         */
        tryCraftX(toCraft) {
            return false;
        }

        //#endregion Craftable resource
    }

    class Support extends Resource {
        // This isn't really a resource but we're going to make a dummy one so that we can treat it like a resource
        
        /**
         * @param {string} id
         */
        constructor(id) {
            super("", id, false, -1, -1, false, -1);
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

            // "43/47"
            return parseInt(document.querySelector("#" + this.id + " > span:nth-child(2)").textContent.split("/")[0]);
        }

        get maxQuantity() {
            if (!this.isUnlocked()) {
                return 0;
            }

            // "43/47"
            return parseInt(document.querySelector("#" + this.id + " > span:nth-child(2)").textContent.split("/")[1]);
        }

        get rateOfChange() {
            // This isn't really a resource so we'll be super tricky here and set the rate of change to be the available quantity
            return this.maxQuantity - this.currentQuantity;
        }

        //#endregion Standard resource

        //#region Basic resource

        isOptionsOpen() {
            return false;
        }
        
        openOptions() {
            return;
        }

        updateOptions() {
            return false;
        }

        tryConstructCrate() {
            return false;
        }

        tryAssignCrate() {
            return false;
        }

        tryUnassignCrate() {
            return false;
        }

        tryConstructContainer() {
            return false;
        }

        tryAssignContainer() {
            return false;
        }

        tryUnassignContainer() {
            return false;
        }

        //#endregion Basic resource

        //#region Craftable resource

        /**
         * @param {string} toCraft
         */
        tryCraftX(toCraft) {
            return false;
        }

        //#endregion Craftable resource
    }

    class LuxuryGoods extends Resource {
        // This isn't really a resource but we're going to make a dummy one so that we can treat it like a resource
        constructor() {
            super("", "LuxuryGoods", false, -1, -1, false, -1);
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

        //#region Basic resource

        isOptionsOpen() {
            return false;
        }
        
        openOptions() {
            return;
        }

        updateOptions() {
            return false;
        }

        tryConstructCrate() {
            return false;
        }

        tryAssignCrate() {
            return false;
        }

        tryUnassignCrate() {
            return false;
        }

        tryConstructContainer() {
            return false;
        }

        tryAssignContainer() {
            return false;
        }

        tryUnassignContainer() {
            return false;
        }

        //#endregion Basic resource

        //#region Craftable resource

        /**
         * @param {string} toCraft
         */
        tryCraftX(toCraft) {
            return false;
        }

        //#endregion Craftable resource
    }

    const SmelterFuelTypes = {
        Lumber: 0,
        Coal: 1,
        Oil: 2,
    }

    const SmelterSmeltingTypes = {
        Iron: 0,
        Steel: 1,
    }

    class Smelter extends Action {
        constructor() {
            super("city", "smelter", true);

            this.isUpdated = false;

            this.toalFueledCount = 0;
            this.totalFueledMax = 0;

            /** @type {boolean[]} */
            this._isFuelUnlocked = [ false, false, false ];

            /** @type {number[]} */
            this._fueled = [ 0, 0, 0 ];

            /** @type {boolean[]} */
            this._isSmeltingUnlocked = [ false, false ];

            /** @type {number[]} */
            this._smelting = [ 0, 0 ];

            /** @type {ResourceProductionCost[][]} */
            this.smeltingConsumption = [ [], [] ];
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
            // Options is currently the cog button for accessing settings
            if (!this.isUnlocked()) {
                return false;
            }

            return document.querySelector("#city-smelter .special") !== null;
        }

        isOptionsOpen() {
            if (!this.hasOptions()) {
                return;
            }

            return state.modal.isOpen() && state.modal.currentModalWindowTitle === "Smelter";
        }
        
        openOptions() {
            if (!this.hasOptions()) {
                return;
            }
            
            let optionsNode = document.querySelector("#city-smelter .special");
            state.modal.openModalWindow();
            // @ts-ignore
            optionsNode.click();
        }

        updateOptions() {
            // We can only update options when the options window is open
            if (!this.isOptionsOpen()) {
                return false;
            }

            let fueledTitleNode = document.querySelector("#specialModal .has-text-info");
            if (fueledTitleNode !== null) {
                this.toalFueledCount = parseInt(fueledTitleNode.textContent.split("/")[0]);
                this.totalFueledMax = parseInt(fueledTitleNode.textContent.split("/")[1]);
            }

            let fueledCurrentNodes = document.querySelectorAll("#specialModal .current");
            for (let i = 0; i < fueledCurrentNodes.length; i++) {
                this._isFuelUnlocked[i] = true;
                this._fueled[i] = parseInt(fueledCurrentNodes[i].textContent.substring(fueledCurrentNodes[i].textContent.indexOf(" ") + 1))
            }

            let smeltingCurrentNodes = document.querySelectorAll("#specialModal .smelting .button");
            for (let i = 0; i < smeltingCurrentNodes.length; i++) {
                this._isSmeltingUnlocked[i] = true;
                this._smelting[i] = parseInt(smeltingCurrentNodes[i].textContent.substring(smeltingCurrentNodes[i].textContent.indexOf(": ") + 2))
            }

            this.isUpdated = true;
            
            return true;
        }

        /**
         * @param {number} fuelType
         */
        isFuelUnlocked(fuelType) {
            return this._isFuelUnlocked[fuelType];
        }

        /**
         * @param {number} fuelType
         */
        fueledCount(fuelType) {
            return this._fueled[fuelType];
        }

        /**
         * @param {number} smeltingType
         */
        smeltingCount(smeltingType) {
            return this._smelting[smeltingType];
        }

        /**
         * @param {number} smeltingType
         */
        isSmeltingUnlocked(smeltingType) {
            // Iron is always unlocked if the smelter is available
            if (smeltingType === SmelterSmeltingTypes.Iron) {
                return this.isUnlocked();
            }

            if (smeltingType === SmelterSmeltingTypes.Steel) {
                return document.querySelector("#tech-steel .oldTech") !== null;
            }

            return false;
        }

        /**
         * @param {number} fuelType
         * @param {number} quantity
         */
        increaseFuel(fuelType, quantity) {
            if (quantity < 0) {
                return this.decreaseFuel(fuelType, quantity * -1);
            }

            if (quantity === 0 || !this.isOptionsOpen()) {
                return false;
            }

            let fuelAddNodes = document.querySelectorAll("#specialModal .add");
            if (fuelAddNodes.length > fuelType) {
                let node = fuelAddNodes[fuelType];
                for (let i = 0; i < quantity; i++) {
                    //@ts-ignore
                    node.click();

                    this.fueledCount[fuelType]++;
                }
                return true;
            }

            // The type of fuel isn't unlocked yet
            return false;
        }

        /**
         * @param {number} fuelType
         * @param {number} quantity
         */
        decreaseFuel(fuelType, quantity) {
            if (quantity < 0) {
                return this.increaseFuel(fuelType, quantity * -1);
            }

            if (quantity === 0 || !this.isOptionsOpen()) {
                return false;
            }

            let fuelSubNodes = document.querySelectorAll("#specialModal .sub");
            if (fuelSubNodes.length > fuelType) {
                let node = fuelSubNodes[fuelType];
                for (let i = 0; i < quantity; i++) {
                    //@ts-ignore
                    node.click();

                    this.fueledCount[fuelType]--;
                }
                return true;
            }

            // The type of fuel isn't unlocked yet
            return false;
        }

        /**
         * @param {number} smeltingType
         * @param {number} quantity
         */
        increaseSmelting(smeltingType, quantity) {
            // Increasing one decreases the other so no need for both an "increaseXXXX" and a "descreaseXXXX"
            if (quantity === 0 || !this.isOptionsOpen()) {
                return false;
            }

            let smeltingNodes = document.querySelectorAll("#specialModal .smelting .button");
            if (smeltingNodes.length > smeltingType) {
                let node = smeltingNodes[smeltingType];
                for (let i = 0; i < quantity; i++) {
                    //@ts-ignore
                    node.click();

                    this._smelting[smeltingType]++;

                    if (smeltingType === SmelterSmeltingTypes.Steel) {
                        this._smelting[SmelterSmeltingTypes.Iron]--;
                    } else if (smeltingType === SmelterSmeltingTypes.Iron) {
                        this._smelting[SmelterSmeltingTypes.Steel]--;
                    }
                }
                return true;
            }

            // The type of smelting isn't unlocked yet
            return false;
        }
    }

    const FactoryGoods = {
        LuxuryGoods: 0,
        Alloy: 1,
        Polymer: 2,
        NanoTube: 3,
    }

    class Factory extends Action {
        constructor() {
            super("city", "factory", true);

            this.isUpdated = false;
            this.currentOperating = 0;
            this.maxOperating = 0;

            /** @type {boolean[]} */
            this._isProductionUnlocked = [ false, false, false, false ];

            /** @type {number[]} */
            this._currentProduction = [ 0, 0, 0, 0 ];
        }

        /**
         * @param {number} factoryGoods
         */
        isProductionUnlocked(factoryGoods) {
            return this._isProductionUnlocked[factoryGoods];
        }

        /**
         * @param {number} factoryGoods
         */
        currentProduction(factoryGoods) {
            return this._currentProduction[factoryGoods];
        }

        hasOptions() {
            // Options is currently the cog button for accessing settings
            if (!this.isUnlocked()) {
                return false;
            }

            return document.querySelector("#city-factory .special") !== null;
        }

        isOptionsOpen() {
            if (!this.hasOptions()) {
                return;
            }

            return state.modal.isOpen() && state.modal.currentModalWindowTitle === "Factory";
        }
        
        openOptions() {
            if (!this.hasOptions()) {
                return;
            }
            
            let optionsNode = document.querySelector("#city-factory .special");
            state.modal.openModalWindow();
            // @ts-ignore
            optionsNode.click();
        }

        updateOptions() {
            // We can only update options when the options window is open
            if (!this.isOptionsOpen()) {
                return false;
            }

            let operatingNode = document.querySelector("#specialModal > div > span:nth-child(2)");
            if (operatingNode !== null) {
                this.currentOperating = parseInt(operatingNode.textContent.split("/")[0]);
                this.maxOperating = parseInt(operatingNode.textContent.split("/")[1]);
            }

            let productionNodes = document.querySelectorAll("#specialModal .factory");
            this._isProductionUnlocked[FactoryGoods.LuxuryGoods] = productionNodes.length > FactoryGoods.LuxuryGoods;
            this._isProductionUnlocked[FactoryGoods.Alloy] = productionNodes.length > FactoryGoods.Alloy;
            this._isProductionUnlocked[FactoryGoods.Polymer] = productionNodes.length > FactoryGoods.Polymer;
            this._isProductionUnlocked[FactoryGoods.NanoTube] = productionNodes.length > FactoryGoods.NanoTube;

            for (let i = 0; i < this._currentProduction.length; i++) {
                if (this._isProductionUnlocked[i]) {
                    this._currentProduction[i] = parseInt(productionNodes[i].querySelector(".current").textContent);
                }
            }

            this.isUpdated = true;
            return true;
        }

        /**
         * @param {number} factoryGoods
         * @param {number} quantity
         */
        increaseProduction(factoryGoods, quantity) {
            if (quantity < 0) {
                return this.decreaseProduction(factoryGoods, quantity * -1);
            }

            if (quantity === 0 || !this.isOptionsOpen()) {
                return false;
            }

            let productionNodes = document.querySelectorAll("#specialModal .factory");
            if (productionNodes.length > factoryGoods) {
                let node = productionNodes[factoryGoods].querySelector(".add");
                for (let i = 0; i < quantity; i++) {
                    //@ts-ignore
                    node.click();

                    this._currentProduction[factoryGoods]++;
                }
                return true;
            }

            // The type of factory goods aren't unlocked yet
            return false;
        }

        /**
         * @param {number} factoryGoods
         * @param {number} quantity
         */
        decreaseProduction(factoryGoods, quantity) {
            if (quantity < 0) {
                return this.increaseProduction(factoryGoods, quantity * -1);
            }

            if (quantity === 0 || !this.isOptionsOpen()) {
                return false;
            }

            let productionNodes = document.querySelectorAll("#specialModal .factory");
            if (productionNodes.length > factoryGoods) {
                let node = productionNodes[factoryGoods].querySelector(".sub");
                for (let i = 0; i < quantity; i++) {
                    //@ts-ignore
                    node.click();

                    this._currentProduction[factoryGoods]--;
                }
                return true;
            }

            // The type of factory goods aren't unlocked yet
            return false;
        }
    }

    class SpaceDock extends Action {
        constructor() {
            super("space", "star_dock", true);

            this.Probes = new Action("spcdock", "probes", true);
            this.Ship = new Action("spcdock", "seeder", true);
            this.Launch = new Action("spcdock", "launch_ship", true);

            this._isOptionsUpdated = false;

            this._isProbesUnlocked = false;
            this.lastProbeCount = 0;

            this._isShipUnlocked = false;
            this.lastShipSegmentCount = 0;
        }

        isProbesUnlocked() {
            return this._isProbesUnlocked;
        }

        isShipUnlocked() {
            return this._isShipUnlocked;
        }

        hasOptions() {
            // Options is currently the cog button for accessing settings
            if (!this.isUnlocked()) {
                return false;
            }

            return document.querySelector("#space-star_dock .special") !== null;
        }

        isOptionsUpdated() {
            return this._isOptionsUpdated;
        }

        isOptionsOpen() {
            if (!this.hasOptions()) {
                return;
            }

            return state.modal.isOpen() && state.modal.currentModalWindowTitle === "Space Dock";
        }
        
        openOptions() {
            if (!this.hasOptions()) {
                return;
            }
            
            let optionsNode = document.querySelector("#space-star_dock .special");
            state.modal.openModalWindow();
            // @ts-ignore
            optionsNode.click();
        }

        updateOptions() {
            // We can only update options when the options window is open
            if (!this.isOptionsOpen()) {
                return false;
            }

            this._isOptionsUpdated = true;

            this._isProbesUnlocked = this.Probes.isUnlocked();
            this.lastProbeCount = this.Probes.count;

            this._isShipUnlocked = this.Ship.isUnlocked();
            this.lastShipSegmentCount = this.Ship.count;
        }

        tryBuildProbe() {
            if (!this.isOptionsOpen()) {
                return false;
            }

            return this.Probes.tryBuild();
        }

        tryBuildShipSegment() {
            // There are only 100 segments
            if (this.lastShipSegmentCount >= 100) {
                return false;
            }

            if (!this.isOptionsOpen()) {
                return false;
            }

            if (this.Ship.count >= 100) {
                return false;
            }

            // We're just going to try clicking 5 times until we get to 100 segments
            let canClick = this.Ship.tryBuild();
            if (canClick) {
                this.Ship.tryBuild()
                this.Ship.tryBuild()
                this.Ship.tryBuild()
                this.Ship.tryBuild()
            }

            return canClick;
        }

        tryLaunchShip() {
            if (!this.isOptionsOpen()) {
                return false;
            }

            return this.Launch.click();
        }
    }

    class ModalWindowManager {
        constructor() {
            this.openThisLoop = false;
            this.openedByScript = false;
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

        openModalWindow() {
            this.openThisLoop = true;
            this.openedByScript = true;
        }

        isOpen() {
            // We want to give the modal time to close so if there was a modal open this loop then just say there is a modal open
            let isModalWindowOpen = document.getElementById("modalBox") !== null;
            if (isModalWindowOpen) {
                this.openThisLoop = true;
            }

            return isModalWindowOpen || this.openThisLoop;
        }

        closeModalWindow() {
            let modalCloseBtn = document.querySelector('.modal > .modal-close');
            if (modalCloseBtn !== null) {
                // @ts-ignore
                modalCloseBtn.click();
                this.openedByScript = false;
            }
        }
    }

    const AttackTypes = {
        Ambush: 0,
        Raid: 1,
        Pillage: 2,
        Assault: 3,
        Siege: 4,
    }

    class BattleManager {
        constructor() {
            this.campaigns = [
                { name: "Ambush", rating: 10 },
                { name: "Raid", rating: 50 },
                { name: "Pillage", rating: 100 },
                { name: "Assault", rating: 200 },
                { name: "Siege", rating: 500 }
            ];
        }

        isUnlocked() {
            return document.getElementById("garrison").style.display !== "none" && document.querySelector("#garrison .campaign") !== null;
        }

        launchCampaign() {
            if (!this.isUnlocked()) {
                return false;
            }

            //@ts-ignore
            document.querySelector("#garrison .campaign").click();
            return true;
        }

        isMercenaryUnlocked() {
            return document.querySelector("#garrison .first") !== null;
        }

        hireMercenary() {
            if (!this.isMercenaryUnlocked()) {
                return false;
            }

            //@ts-ignore
            document.querySelector("#garrison .first").click();
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
            if (!this.isUnlocked()) {
                return 0;
            }

            return parseInt(document.querySelector("#garrison .barracks > span:nth-Child(2)").textContent.split(" / ")[0]);
        }

        get maxSoldiers() {
            if (!this.isUnlocked()) {
                return 0;
            }

            return parseInt(document.querySelector("#garrison .barracks > span:nth-Child(2)").textContent.split(" / ")[1]);
        }

        get woundedSoldiers() {
            if (!this.isUnlocked()) {
                return 0;
            }

            return parseInt(document.querySelector("#garrison .barracks:nth-child(2) > span:nth-child(2)").textContent);
        }

        get attackType() {
            if (!this.isUnlocked()) {
                return "";
            }

            return document.querySelector("#tactics .current").textContent;
        }

        increaseCampaignDifficulty() {
            if (!this.isUnlocked()) {
                return false;
            }

            //@ts-ignore
            document.querySelector("#tactics .add").click();
            return true;
        }

        decreaseCampaignDifficulty() {
            if (!this.isUnlocked()) {
                return false;
            }

            //@ts-ignore
            document.querySelector("#tactics .sub").click();
            return true;
        }

        get currentBattalion() {
            if (!this.isUnlocked()) {
                return 0;
            }

            return parseInt(document.querySelector("#battalion .current").textContent);
        }

        addBattalion() {
            if (!this.isUnlocked()) {
                return false;
            }

            //@ts-ignore
            document.querySelector("#battalion .add").click();
            return true;
        }

        removeBattalion() {
            if (!this.isUnlocked()) {
                return false;
            }

            //@ts-ignore
            document.querySelector("#battalion .sub").click();
            return true;
        }

       /**
         * @return {boolean}
         */
        switchToBestAttackType() {
            let offense = this.currentOffensiveRating;
            let currentAttackTypeIndex = findArrayIndex(this.campaigns, "name", this.attackType);

            if (this.campaigns.length === 0 || currentAttackTypeIndex === -1) {
                return false;
            }

            for (let i = this.campaigns.length - 1; i >= 0; i--) {
                let campaign = this.campaigns[i];
                
                if (offense >= campaign.rating && currentAttackTypeIndex < i) {
                    this.increaseCampaignDifficulty();
                    return false;
                }

                if (offense < campaign.rating && currentAttackTypeIndex >= i && i > 0) {
                    this.decreaseCampaignDifficulty();
                    return false;
                }
            }

            return true;
        }
    }
    
    //#endregion Class Declarations

    //#region State and Initialisation

    var state = {
        loopCounter: 1,

        modal: new ModalWindowManager(),
        battle: new BattleManager(),
        
        lastGenomeSequenceValue: 0,
        lastCratesOwned: -1,
        lastContainersOwned: -1,
        
        goal: "Standard",

        /** @type {Resource[]} */
        allResourceList: [],

        /** @type {Resource[]} */
        tradableResourceList: [],

        /** @type {Resource[]} */
        craftableResourceList: [],
        resources: {
            // Base resources
            Money: new Resource("res", "Money", false, -1, -1, false, -1),
            Population: new Resource("res", "Population", false, -1, -1, false, -1), // The population node is special and its id will change to the race name
            Knowledge: new Resource("res", "Knowledge", false, -1, -1, false, -1),
            Crates: new Resource("res", "Crates", false, -1, -1, false, -1),
            Containers: new Resource("res", "Containers", false, -1, -1, false, -1),
            Plasmids: new Resource("res", "Plasmid", false, -1, -1, false, -1),

            // Special not-really-resources-but-we'll-treat-them-like-resources resources
            Power: new Power(),
            LuxuryGoods: new LuxuryGoods(),
            MoonSupport: new Support("srspc_moon"),
            RedSupport: new Support("srspc_red"),
            SunSupport: new Support("srspc_sun"),
            BeltSupport: new Support("srspc_belt"),

            // Basic resources (can trade for these)
            Food: new Resource("res", "Food", true, 0.5, 0.9, false, -1),
            Lumber: new Resource("res", "Lumber", true, 0.5, 0.9, false, -1),
            Stone: new Resource("res", "Stone", true, 0.5, 0.9, false, -1),
            Furs: new Resource("res", "Furs", true, 0.5, 0.9, false, -1),
            Copper: new Resource("res", "Copper", true, 0.5, 0.9, false, -1),
            Iron: new Resource("res", "Iron", true, 0.5, 0.9, false, -1),
            Cement: new Resource("res", "Cement", true, 0.3, 0.9, false, -1),
            Coal: new Resource("res", "Coal", true, 0.5, 0.9, false, -1),
            Oil: new Resource("res", "Oil", true, 0.5, 0.9, false, -1),
            Uranium: new Resource("res", "Uranium", true, 0.5, 0.9, false, -1),
            Steel: new Resource("res", "Steel", true, 0.5, 0.9, false, -1),
            Titanium: new Resource("res", "Titanium", true, 0.8, 0.9, false, -1),
            Alloy: new Resource("res", "Alloy", true, 0.8, 0.9, false, -1),
            Polymer: new Resource("res", "Polymer", true, 0.8, 0.9, false, -1),
            Iridium: new Resource("res", "Iridium", true, 0.8, 0.9, false, -1),
            Helium_3: new Resource("res", "Helium_3", true, 0.8, 0.9, false, -1),

            // Advanced resources (can't trade for these)
            Neutronium: new Resource("res", "Neutronium", false, -1, -1, false, -1),
            Elerium: new Resource("res", "Elerium", false, -1, -1, false, -1),
            NanoTube: new Resource("res", "Nano_Tube", false, -1, -1, false, -1),
            
            // Craftable resources
            Plywood: new Resource("res", "Plywood", false, -1, -1, true, 0.5),
            Brick: new Resource("res", "Brick", false, -1, -1, true, 0.5),
            WroughtIron: new Resource("res", "Wrought_Iron", false, -1, -1, true, 0.5),
            SheetMetal: new Resource("res", "Sheet_Metal", false, -1, -1, true, 0.5),
            Mythril: new Resource("res", "Mythril", false, -1, -1, true, 0.5),
        },
        
        /** @type {Action[]} */
        evolutionList: [],
        evolutions: {
            Rna: new Action("evo", "rna", false),
            Dna: new Action("evo", "dna", false),

            RaceAntids: new Action("evo", "antid", false),

            Sentience: new Action("evo", "sentience", false),
            //Ectothermic: new Action("evo", "ectothermic", false),
            //Eggshell: new Action("evo", "eggshell", false),
            Arthropods: new Action("evo", "athropods", false),
            BilateralSymmetry: new Action("evo", "bilateral_symmetry", false),
            Multicellular: new Action("evo", "multicellular", false),
            Phagocytosis: new Action("evo", "phagocytosis", false),
            SexualReproduction: new Action("evo", "sexual_reproduction", false),
            
            Membrane: new Action("evo", "membrane", true),
            Organelles: new Action("evo", "organelles", true),
            Nucleus: new Action("evo", "nucleus", true),
            EukaryoticCell: new Action("evo", "eukaryotic_cell", true),
            Mitochondria: new Action("evo", "mitochondria", true),
        },

        /** @type {Action[]} */
        allBuildingList: [],
        
        /** @type {Action[]} */
        cityBuildingList: [],
        cityBuildings: {
            Food: new Action("city", "food", false),
            Lumber: new Action("city", "lumber", false),
            Stone: new Action("city", "stone", false),

            University: new Action("city", "university", true),
            Wardenclyffe: new Action("city", "wardenclyffe", true),
            Mine: new Action("city", "mine", true),
            CoalMine: new Action("city", "coal_mine", true),
            Smelter: new Smelter(),
            CoalPower: new Action("city", "coal_power", true),
            Temple: new Action("city", "temple", true),
            OilWell: new Action("city", "oil_well", true),
            BioLab: new Action("city", "biolab", true),
            StorageYard: new Action("city", "storage_yard", true),
            Warehouse: new Action("city", "warehouse", true),
            OilPower: new Action("city", "oil_power", true),
            Bank: new Action("city", "bank", true),
            Garrison: new Action("city", "garrison", true),
            House: new Action("city", "house", true),
            Cottage: new Action("city", "cottage", true),
            Apartment: new Action("city", "apartment", true),
            Farm: new Action("city", "farm", true),
            Mill: new Action("city", "mill", true),
            Silo: new Action("city", "silo", true),
            Shed: new Action("city", "shed", true),
            LumberYard: new Action("city", "lumber_yard", true),
            RockQuarry: new Action("city", "rock_quarry", true),
            CementPlant: new Action("city", "cement_plant", true),
            Foundry: new Action("city", "foundry", true),
            Factory: new Factory(), // Special building with options
            OilDepot: new Action("city", "oil_depot", true),
            Trade: new Action("city", "trade", true),
            Amphitheatre: new Action("city", "amphitheatre", true),
            Library: new Action("city", "library", true),
            Sawmill: new Action("city", "sawmill", true),
            FissionPower: new Action("city", "fission_power", true),
            Lodge: new Action("city", "lodge", true),
            Smokehouse: new Action("city", "smokehouse", true),
            Casino: new Action("city", "casino", true),
            TouristCenter: new Action("city", "tourist_center", true),
            MassDriver: new Action("city", "mass_driver", true),
            Wharf: new Action("city", "wharf", true),
        },
        
        /** @type {Action[]} */
        spaceBuildingList: [],
        spaceBuildings: {
            // Space
            SpaceTestLaunch: new Action("space", "test_launch", true),
            SpaceSatellite: new Action("space", "satellite", true),
            SpaceGps: new Action("space", "gps", true),
            SpacePropellantDepot: new Action("space", "propellant_depot", true),
            SpaceNavBeacon: new Action("space", "nav_beacon", true),
            
            // Moon
            MoonMission: new Action("space", "moon_mission", true),
            MoonBase: new Action("space", "moon_base", true),
            MoonIridiumMine: new Action("space", "iridium_mine", true),
            MoonHeliumMine: new Action("space", "helium_mine", true),
            MoonObservatory: new Action("space", "observatory", true),
            
            // Red
            RedMission: new Action("space", "red_mission", true),
            RedSpaceport: new Action("space", "spaceport", true),
            RedTower: new Action("space", "red_tower", true),
            RedLivingQuarters: new Action("space", "living_quarters", true),
            RedGarage: new Action("space", "garage", true),
            RedMine: new Action("space", "red_mine", true),
            RedFabrication: new Action("space", "fabrication", true),
            RedFactory: new Action("space", "red_factory", true),
            RedBiodome: new Action("space", "biodome", true),
            RedExoticLab: new Action("space", "exotic_lab", true),
            RedSpaceBarracks: new Action("space", "space_barracks", true),
            
            // Hell
            HellMission: new Action("space", "hell_mission", true),
            HellGeothermal: new Action("space", "geothermal", true),
            HellSwarmPlant: new Action("space", "swarm_plant", true),
            
            // Sun
            SunMission: new Action("space", "sun_mission", true),
            SunSwarmControl: new Action("space", "swarm_control", true),
            SunSwarmSatellite: new Action("space", "swarm_satellite", true),
            
            // Gas
            GasMission: new Action("space", "gas_mission", true),
            GasMining: new Action("space", "gas_mining", true),
            GasStorage: new Action("space", "gas_storage", true),
            GasSpaceDock: new SpaceDock(), // Special building with options
            
            // Gas moon
            GasMoonMission: new Action("space", "gas_moon_mission", true),
            GasMoonOutpost: new Action("space", "outpost", true),
            GasMoonDrone: new Action("space", "drone", true),
            GasMoonOilExtractor: new Action("space", "oil_extractor", true),
            
            // Belt
            BeltMission: new Action("space", "belt_mission", true),
            BeltSpaceStation: new Action("space", "space_station", true),
            BeltEleriumShip: new Action("space", "elerium_ship", true),
            BeltIridiumShip: new Action("space", "iridium_ship", true),
            BeltIronShip: new Action("space", "iron_ship", true),
            
            // Dwarf
            DwarfMission: new Action("space", "dwarf_mission", true),
            DwarfEleriumContainer: new Action("space", "elerium_contain", true),
            DwarfEleriumReactor: new Action("space", "e_reactor", true),
            DwarfWorldCollider: new Action("space", "world_collider", true),
            DwarfWorldController: new Action("space", "world_controller", true),
        },

        /** @type {Action[]} */
        consumptionPriorityList: [],

        
    };

    function initialiseState() {
        // Construct tradable resource list
        state.tradableResourceList.push(state.resources.Food);
        state.tradableResourceList.push(state.resources.Lumber);
        state.tradableResourceList.push(state.resources.Stone);
        state.tradableResourceList.push(state.resources.Furs);
        state.tradableResourceList.push(state.resources.Copper);
        state.tradableResourceList.push(state.resources.Iron);
        state.tradableResourceList.push(state.resources.Cement);
        state.tradableResourceList.push(state.resources.Coal);
        state.tradableResourceList.push(state.resources.Oil);
        state.tradableResourceList.push(state.resources.Uranium);
        state.tradableResourceList.push(state.resources.Steel);
        state.tradableResourceList.push(state.resources.Titanium);
        state.tradableResourceList.push(state.resources.Alloy);
        state.tradableResourceList.push(state.resources.Polymer);
        state.tradableResourceList.push(state.resources.Iridium);
        state.tradableResourceList.push(state.resources.Helium_3);

        // Construct craftable resource list
        state.craftableResourceList.push(state.resources.Plywood);
        state.resources.Plywood.requiredResourcesToAction.push(state.resources.Lumber);
        state.craftableResourceList.push(state.resources.Brick);
        state.resources.Brick.requiredResourcesToAction.push(state.resources.Cement);
        state.craftableResourceList.push(state.resources.WroughtIron);
        state.resources.WroughtIron.requiredResourcesToAction.push(state.resources.Iron);
        state.craftableResourceList.push(state.resources.SheetMetal);
        state.resources.SheetMetal.requiredResourcesToAction.push(state.resources.Steel);
        state.craftableResourceList.push(state.resources.Mythril);
        state.resources.Mythril.requiredResourcesToAction.push(state.resources.Iridium);
        state.resources.Mythril.requiredResourcesToAction.push(state.resources.Alloy);

        // Construct all resource list
        state.allResourceList = state.tradableResourceList.concat(state.craftableResourceList);
        state.allResourceList.push(state.resources.Money);
        state.allResourceList.push(state.resources.Population);
        state.allResourceList.push(state.resources.Knowledge);
        state.allResourceList.push(state.resources.Crates);
        state.allResourceList.push(state.resources.Containers);
        state.allResourceList.push(state.resources.Plasmids);
        state.allResourceList.push(state.resources.Power);
        state.allResourceList.push(state.resources.MoonSupport);
        state.allResourceList.push(state.resources.RedSupport);
        state.allResourceList.push(state.resources.SunSupport);
        state.allResourceList.push(state.resources.BeltSupport);
        state.allResourceList.push(state.resources.Neutronium);
        state.allResourceList.push(state.resources.Elerium);
        state.allResourceList.push(state.resources.NanoTube);

        state.resources.Alloy.productionCost.push(new ResourceProductionCost(state.resources.Copper, 1.86, 75)); //1.49
        state.resources.Alloy.productionCost.push(new ResourceProductionCost(state.resources.Titanium, 0.36, 5)); //0.29
        state.resources.Polymer.productionCost.push(new ResourceProductionCost(state.resources.Oil, 0.45, 10));
        state.resources.Polymer.productionCost.push(new ResourceProductionCost(state.resources.Lumber, 36, 1000));
        state.resources.NanoTube.productionCost.push(new ResourceProductionCost(state.resources.Coal, 20, 30));
        state.resources.NanoTube.productionCost.push(new ResourceProductionCost(state.resources.Neutronium, 0.125, 1));
        
        // Construct evolution phase list
        state.evolutionList.push(state.evolutions.Rna);
        state.evolutionList.push(state.evolutions.Dna);
        state.evolutionList.push(state.evolutions.RaceAntids);
        state.evolutionList.push(state.evolutions.Sentience);
        state.evolutionList.push(state.evolutions.Arthropods);
        state.evolutionList.push(state.evolutions.BilateralSymmetry);
        state.evolutionList.push(state.evolutions.Multicellular);
        state.evolutionList.push(state.evolutions.Phagocytosis);
        state.evolutionList.push(state.evolutions.SexualReproduction);
        state.evolutionList.push(state.evolutions.Membrane);
        state.evolutionList.push(state.evolutions.Organelles);
        state.evolutionList.push(state.evolutions.Nucleus);
        state.evolutionList.push(state.evolutions.EukaryoticCell);
        state.evolutionList.push(state.evolutions.Mitochondria);
        
        // Construct city builds list
        state.cityBuildingList.push(state.cityBuildings.University);
        state.cityBuildings.University.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.University.addRequiredResource(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Wardenclyffe);
        state.cityBuildings.Wardenclyffe.addRequiredResource(state.resources.Copper);
        state.cityBuildings.Wardenclyffe.addRequiredResource(state.resources.Cement);
        state.cityBuildings.Wardenclyffe.addRequiredResource(state.resources.SheetMetal);
        state.cityBuildings.Wardenclyffe.addPowerConsumption(2);
        state.cityBuildingList.push(state.cityBuildings.Mine);
        state.cityBuildings.Mine.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.Mine.addPowerConsumption(1);
        state.cityBuildingList.push(state.cityBuildings.CoalMine);
        state.cityBuildings.CoalMine.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.CoalMine.addRequiredResource(state.resources.WroughtIron);
        state.cityBuildings.CoalMine.addPowerConsumption(1);
        state.cityBuildingList.push(state.cityBuildings.Smelter);
        state.cityBuildings.Smelter.addRequiredResource(state.resources.Iron);
        state.cityBuildings.Smelter.addSmeltingConsumption(SmelterSmeltingTypes.Steel, state.resources.Coal, 0.25, 1.25);
        state.cityBuildings.Smelter.addSmeltingConsumption(SmelterSmeltingTypes.Steel, state.resources.Iron, 2, 6);
        state.cityBuildingList.push(state.cityBuildings.CoalPower);
        state.cityBuildings.CoalPower.addRequiredResource(state.resources.Copper);
        state.cityBuildings.CoalPower.addRequiredResource(state.resources.Cement);
        state.cityBuildings.CoalPower.addRequiredResource(state.resources.Steel);
        state.cityBuildings.CoalPower.addPowerConsumption(-5);
        state.cityBuildings.CoalPower.addResourceConsumption(state.resources.Coal, 0.35);
        state.cityBuildingList.push(state.cityBuildings.Temple);
        state.cityBuildings.Temple.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.Temple.addRequiredResource(state.resources.Furs);
        state.cityBuildings.Temple.addRequiredResource(state.resources.Cement);
        state.cityBuildingList.push(state.cityBuildings.OilWell);
        state.cityBuildings.OilWell.addRequiredResource(state.resources.Cement);
        state.cityBuildings.OilWell.addRequiredResource(state.resources.Steel);
        state.cityBuildingList.push(state.cityBuildings.BioLab);
        state.cityBuildings.BioLab.addRequiredResource(state.resources.Copper);
        state.cityBuildings.BioLab.addRequiredResource(state.resources.Alloy);
        state.cityBuildings.BioLab.addPowerConsumption(2);
        state.cityBuildingList.push(state.cityBuildings.StorageYard);
        state.cityBuildings.StorageYard.addRequiredResource(state.resources.Brick);
        state.cityBuildings.StorageYard.addRequiredResource(state.resources.WroughtIron);
        state.cityBuildingList.push(state.cityBuildings.Warehouse);
        state.cityBuildings.Warehouse.addRequiredResource(state.resources.Iron);
        state.cityBuildings.Warehouse.addRequiredResource(state.resources.Cement);
        state.cityBuildingList.push(state.cityBuildings.OilPower);
        state.cityBuildings.OilPower.addRequiredResource(state.resources.Copper);
        state.cityBuildings.OilPower.addRequiredResource(state.resources.Cement);
        state.cityBuildings.OilPower.addRequiredResource(state.resources.Steel);
        state.cityBuildings.OilPower.addPowerConsumption(-6);
        state.cityBuildings.OilPower.addResourceConsumption(state.resources.Oil, 0.65);
        state.cityBuildingList.push(state.cityBuildings.Bank);
        state.cityBuildings.Bank.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.Bank.addRequiredResource(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Garrison);
        state.cityBuildings.Garrison.addRequiredResource(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.House);
        state.cityBuildings.House.addRequiredResource(state.resources.Lumber);
        state.cityBuildingList.push(state.cityBuildings.Cottage);
        state.cityBuildings.Cottage.addRequiredResource(state.resources.Plywood);
        state.cityBuildings.Cottage.addRequiredResource(state.resources.Brick);
        state.cityBuildings.Cottage.addRequiredResource(state.resources.WroughtIron);
        state.cityBuildingList.push(state.cityBuildings.Apartment);
        state.cityBuildings.Apartment.addRequiredResource(state.resources.Furs);
        state.cityBuildings.Apartment.addRequiredResource(state.resources.Copper);
        state.cityBuildings.Apartment.addRequiredResource(state.resources.Cement);
        state.cityBuildings.Apartment.addRequiredResource(state.resources.Steel);
        state.cityBuildings.Apartment.addPowerConsumption(1);
        state.cityBuildingList.push(state.cityBuildings.Farm);
        state.cityBuildings.Farm.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.Farm.addRequiredResource(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Mill);
        state.cityBuildings.Mill.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.Mill.addRequiredResource(state.resources.Iron);
        state.cityBuildings.Mill.addRequiredResource(state.resources.Cement);
        state.cityBuildings.Mill.addPowerConsumption(-1);
        state.cityBuildingList.push(state.cityBuildings.Silo);
        state.cityBuildings.Silo.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.Silo.addRequiredResource(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Shed); // Is this one special? Will have to think about how to do this one
        state.cityBuildings.Shed.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.Shed.addRequiredResource(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.LumberYard);
        state.cityBuildings.LumberYard.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.LumberYard.addRequiredResource(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.RockQuarry);
        state.cityBuildings.RockQuarry.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.RockQuarry.addRequiredResource(state.resources.Stone);
        state.cityBuildings.RockQuarry.addPowerConsumption(1);
        state.cityBuildingList.push(state.cityBuildings.CementPlant);
        state.cityBuildings.CementPlant.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.CementPlant.addRequiredResource(state.resources.Stone);
        state.cityBuildings.CementPlant.addPowerConsumption(2);
        state.cityBuildingList.push(state.cityBuildings.Foundry);
        state.cityBuildings.Foundry.addRequiredResource(state.resources.Copper);
        state.cityBuildings.Foundry.addRequiredResource(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Factory);
        state.cityBuildings.Factory.addRequiredResource(state.resources.Cement);
        state.cityBuildings.Factory.addRequiredResource(state.resources.Steel);
        state.cityBuildings.Factory.addRequiredResource(state.resources.Titanium);
        state.cityBuildings.Factory.addPowerConsumption(3);
        state.cityBuildingList.push(state.cityBuildings.OilDepot);
        state.cityBuildings.OilDepot.addRequiredResource(state.resources.Cement);
        state.cityBuildings.OilDepot.addRequiredResource(state.resources.SheetMetal);
        state.cityBuildingList.push(state.cityBuildings.Trade);
        state.cityBuildings.Trade.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.Trade.addRequiredResource(state.resources.Stone);
        state.cityBuildings.Trade.addRequiredResource(state.resources.Furs);
        state.cityBuildingList.push(state.cityBuildings.Amphitheatre);
        state.cityBuildings.Amphitheatre.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.Amphitheatre.addRequiredResource(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Library);
        state.cityBuildings.Library.addRequiredResource(state.resources.Furs);
        state.cityBuildings.Library.addRequiredResource(state.resources.Plywood);
        state.cityBuildings.Library.addRequiredResource(state.resources.Brick);
        state.cityBuildingList.push(state.cityBuildings.Sawmill);
        state.cityBuildings.Sawmill.addRequiredResource(state.resources.Iron);
        state.cityBuildings.Sawmill.addRequiredResource(state.resources.Cement);
        state.cityBuildings.Sawmill.addPowerConsumption(1);
        state.cityBuildingList.push(state.cityBuildings.FissionPower);
        state.cityBuildings.FissionPower.addRequiredResource(state.resources.Copper);
        state.cityBuildings.FissionPower.addRequiredResource(state.resources.Cement);
        state.cityBuildings.FissionPower.addRequiredResource(state.resources.Titanium);
        state.cityBuildings.FissionPower.addPowerConsumption(-14); // Goes up to 18 after breeder reactor tech researched. This is set in UpdateState().
        state.cityBuildings.FissionPower.addResourceConsumption(state.resources.Uranium, 0.1);
        state.cityBuildingList.push(state.cityBuildings.Lodge); // Cath only
        state.cityBuildings.Lodge.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.Lodge.addRequiredResource(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Smokehouse); // Cath only
        state.cityBuildings.Smokehouse.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.Smokehouse.addRequiredResource(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Casino);
        state.cityBuildings.Casino.addRequiredResource(state.resources.Furs);
        state.cityBuildings.Casino.addRequiredResource(state.resources.Plywood);
        state.cityBuildings.Casino.addRequiredResource(state.resources.Brick);
        state.cityBuildingList.push(state.cityBuildings.TouristCenter);
        state.cityBuildings.TouristCenter.addRequiredResource(state.resources.Stone);
        state.cityBuildings.TouristCenter.addRequiredResource(state.resources.Furs);
        state.cityBuildings.TouristCenter.addRequiredResource(state.resources.Plywood);
        state.cityBuildings.TouristCenter.addResourceConsumption(state.resources.Food, 50);
        state.cityBuildingList.push(state.cityBuildings.MassDriver);
        state.cityBuildings.MassDriver.addRequiredResource(state.resources.Copper);
        state.cityBuildings.MassDriver.addRequiredResource(state.resources.Iron);
        state.cityBuildings.MassDriver.addRequiredResource(state.resources.Iridium);
        state.cityBuildings.MassDriver.addPowerConsumption(5);
        state.cityBuildingList.push(state.cityBuildings.Wharf);
        state.cityBuildings.Wharf.addRequiredResource(state.resources.Lumber);
        state.cityBuildings.Wharf.addRequiredResource(state.resources.Cement);
        state.cityBuildings.Wharf.addRequiredResource(state.resources.Oil);

        // Construct space buildsings list
        // TODO: Space! resource requirements, power on state (eg. -25 food) and planet "support"
        state.spaceBuildingList.push(state.spaceBuildings.SpaceTestLaunch);
        state.spaceBuildingList.push(state.spaceBuildings.SpaceSatellite);
        state.spaceBuildingList.push(state.spaceBuildings.SpaceGps);
        state.spaceBuildingList.push(state.spaceBuildings.SpacePropellantDepot);
        state.spaceBuildingList.push(state.spaceBuildings.SpaceNavBeacon);
        state.spaceBuildings.SpaceNavBeacon.addPowerConsumption(2);
        state.spaceBuildings.SpaceNavBeacon.addResourceConsumption(state.resources.MoonSupport, -1);

        state.spaceBuildingList.push(state.spaceBuildings.MoonMission);
        state.spaceBuildingList.push(state.spaceBuildings.MoonBase); // this building resets ui when clicked
        state.spaceBuildings.MoonBase.addPowerConsumption(4);
        state.spaceBuildings.MoonBase.addResourceConsumption(state.resources.MoonSupport, -2);
        state.spaceBuildings.MoonBase.addResourceConsumption(state.resources.Oil, 2);
        state.spaceBuildingList.push(state.spaceBuildings.MoonIridiumMine);
        state.spaceBuildings.MoonIridiumMine.addResourceConsumption(state.resources.MoonSupport, 1);
        state.spaceBuildingList.push(state.spaceBuildings.MoonHeliumMine);
        state.spaceBuildings.MoonHeliumMine.addResourceConsumption(state.resources.MoonSupport, 1);
        state.spaceBuildingList.push(state.spaceBuildings.MoonObservatory);
        state.spaceBuildings.MoonObservatory.addResourceConsumption(state.resources.MoonSupport, 1);

        state.spaceBuildingList.push(state.spaceBuildings.RedMission);
        state.spaceBuildingList.push(state.spaceBuildings.RedSpaceport); // this building resets ui when clicked
        state.spaceBuildings.RedSpaceport.addPowerConsumption(5);
        state.spaceBuildings.RedSpaceport.addResourceConsumption(state.resources.RedSupport, -3);
        state.spaceBuildings.RedSpaceport.addResourceConsumption(state.resources.Helium_3, 1.25);
        state.spaceBuildings.RedSpaceport.addResourceConsumption(state.resources.Food, 25);
        state.spaceBuildingList.push(state.spaceBuildings.RedTower);
        state.spaceBuildings.RedTower.addPowerConsumption(2);
        state.spaceBuildings.RedTower.addResourceConsumption(state.resources.RedSupport, -1);
        state.spaceBuildingList.push(state.spaceBuildings.RedLivingQuarters);
        state.spaceBuildings.RedLivingQuarters.addResourceConsumption(state.resources.RedSupport, 1);
        state.spaceBuildingList.push(state.spaceBuildings.RedGarage);
        state.spaceBuildingList.push(state.spaceBuildings.RedMine);
        state.spaceBuildings.RedMine.addResourceConsumption(state.resources.RedSupport, 1);
        state.spaceBuildingList.push(state.spaceBuildings.RedFabrication);
        state.spaceBuildings.RedFabrication.addResourceConsumption(state.resources.RedSupport, 1);
        state.spaceBuildingList.push(state.spaceBuildings.RedFactory);
        state.spaceBuildings.RedFactory.addPowerConsumption(3);
        state.spaceBuildings.RedFactory.addResourceConsumption(state.resources.Helium_3, 1);
        state.spaceBuildingList.push(state.spaceBuildings.RedBiodome);
        state.spaceBuildings.RedBiodome.addResourceConsumption(state.resources.RedSupport, 1);
        state.spaceBuildingList.push(state.spaceBuildings.RedExoticLab); // this building resets ui when clicked
        state.spaceBuildings.RedExoticLab.addResourceConsumption(state.resources.RedSupport, 1);
        state.spaceBuildingList.push(state.spaceBuildings.RedSpaceBarracks);
        state.spaceBuildings.RedSpaceBarracks.addResourceConsumption(state.resources.Oil, 2);
        state.spaceBuildings.RedSpaceBarracks.addResourceConsumption(state.resources.Food, 10);

        state.spaceBuildingList.push(state.spaceBuildings.HellMission);
        state.spaceBuildingList.push(state.spaceBuildings.HellGeothermal);
        state.spaceBuildings.HellGeothermal.addPowerConsumption(-8);
        state.spaceBuildings.HellGeothermal.addResourceConsumption(state.resources.Helium_3, 0.5);
        state.spaceBuildingList.push(state.spaceBuildings.HellSwarmPlant);

        state.spaceBuildingList.push(state.spaceBuildings.SunMission);
        state.spaceBuildingList.push(state.spaceBuildings.SunSwarmControl);
        state.spaceBuildings.SunSwarmControl.addResourceConsumption(state.resources.SunSupport, -4);
        state.spaceBuildingList.push(state.spaceBuildings.SunSwarmSatellite);
        state.spaceBuildings.SunSwarmSatellite.addPowerConsumption(-1);
        state.spaceBuildings.SunSwarmSatellite.addResourceConsumption(state.resources.SunSupport, 1);

        state.spaceBuildingList.push(state.spaceBuildings.GasMission);
        state.spaceBuildingList.push(state.spaceBuildings.GasMining);
        state.spaceBuildings.GasMining.addPowerConsumption(2);
        state.spaceBuildingList.push(state.spaceBuildings.GasStorage);
        state.spaceBuildingList.push(state.spaceBuildings.GasSpaceDock);

        state.spaceBuildingList.push(state.spaceBuildings.GasMoonMission);
        state.spaceBuildingList.push(state.spaceBuildings.GasMoonOutpost);
        state.spaceBuildings.GasMoonOutpost.addPowerConsumption(3);
        state.spaceBuildings.GasMoonOutpost.addResourceConsumption(state.resources.Oil, 2);
        state.spaceBuildingList.push(state.spaceBuildings.GasMoonDrone);
        state.spaceBuildingList.push(state.spaceBuildings.GasMoonOilExtractor);
        state.spaceBuildings.GasMoonOilExtractor.addPowerConsumption(1);

        state.spaceBuildingList.push(state.spaceBuildings.BeltMission);
        state.spaceBuildingList.push(state.spaceBuildings.BeltSpaceStation); // this building resets ui when clicked
        state.spaceBuildings.BeltSpaceStation.addPowerConsumption(3);
        state.spaceBuildings.BeltSpaceStation.addResourceConsumption(state.resources.BeltSupport, -3);
        state.spaceBuildings.BeltSpaceStation.addResourceConsumption(state.resources.Food, 10);
        state.spaceBuildings.BeltSpaceStation.addResourceConsumption(state.resources.Helium_3, 2.5);
        state.spaceBuildingList.push(state.spaceBuildings.BeltEleriumShip);
        state.spaceBuildings.BeltEleriumShip.addResourceConsumption(state.resources.BeltSupport, 2);
        state.spaceBuildingList.push(state.spaceBuildings.BeltIridiumShip);
        state.spaceBuildings.BeltIridiumShip.addResourceConsumption(state.resources.BeltSupport, 1);
        state.spaceBuildingList.push(state.spaceBuildings.BeltIronShip);
        state.spaceBuildings.BeltIronShip.addResourceConsumption(state.resources.BeltSupport, 1);

        state.spaceBuildingList.push(state.spaceBuildings.DwarfMission);
        state.spaceBuildingList.push(state.spaceBuildings.DwarfEleriumContainer);
        state.spaceBuildings.DwarfEleriumContainer.addPowerConsumption(6);
        state.spaceBuildingList.push(state.spaceBuildings.DwarfEleriumReactor);
        state.spaceBuildings.DwarfEleriumReactor.addPowerConsumption(-25);
        state.spaceBuildings.DwarfEleriumReactor.addResourceConsumption(state.resources.Elerium, 0.05);
        state.spaceBuildingList.push(state.spaceBuildings.DwarfWorldCollider);
        state.spaceBuildingList.push(state.spaceBuildings.DwarfWorldController);
        state.spaceBuildings.DwarfWorldController.addPowerConsumption(20);
        
        // Construct all buildings list
        state.allBuildingList = state.cityBuildingList.concat(state.spaceBuildingList);

        // Populate each buildings required basic resources
        // Populate each resources building list
        for (let i = 0; i < state.allBuildingList.length; i++) {
            let building = state.allBuildingList[i];
            
            for (let j = 0; j < building.requiredResourcesToAction.length; j++) {
                let resource = building.requiredResourcesToAction[j];

                // If its just a basic resource then add it to the list
                // But if it is a craftable resource then add the craftable resource's basic components to the list
                if (!resource.isCraftable()) {
                    building.requiredBasicResourcesToAction.push(resource);
                    continue;
                }

                for (let k = 0; k < resource.requiredResourcesToAction.length; k++) {
                    building.requiredBasicResourcesToAction.push(resource.requiredResourcesToAction[k]);
                }
            }

            // For each resource build a list of buildings that resource is used to construct
            for (let k = 0; k < building.requiredResourcesToAction.length; k++) {
                if (building.requiredResourcesToAction[k].isCraftable()) {
                    building.requiredResourcesToAction[k].usedInBuildings.push(building);
                }
            }
            
            for (let l = 0; l < building.requiredBasicResourcesToAction.length; l++) {
                building.requiredBasicResourcesToAction[l].usedInBuildings.push(building);
            }
        }

        // This list is the priority order that we want to power our buildings in
        state.consumptionPriorityList.push(state.cityBuildings.Mill);
        state.consumptionPriorityList.push(state.cityBuildings.Apartment);
        state.consumptionPriorityList.push(state.cityBuildings.Wardenclyffe);
        state.consumptionPriorityList.push(state.cityBuildings.BioLab);
        state.consumptionPriorityList.push(state.cityBuildings.Mine);
        state.consumptionPriorityList.push(state.cityBuildings.CementPlant);
        state.consumptionPriorityList.push(state.cityBuildings.Sawmill);
        state.consumptionPriorityList.push(state.cityBuildings.RockQuarry);
        state.consumptionPriorityList.push(state.cityBuildings.CoalMine);
        state.consumptionPriorityList.push(state.cityBuildings.Factory);

        state.consumptionPriorityList.push(state.spaceBuildings.GasMoonOutpost);
        state.consumptionPriorityList.push(state.spaceBuildings.HellGeothermal); // produces power

        state.consumptionPriorityList.push(state.spaceBuildings.BeltSpaceStation);
        state.consumptionPriorityList.push(state.spaceBuildings.BeltEleriumShip);
        state.consumptionPriorityList.push(state.spaceBuildings.DwarfEleriumReactor); // produces power
        state.consumptionPriorityList.push(state.spaceBuildings.BeltIridiumShip);
        state.consumptionPriorityList.push(state.spaceBuildings.BeltIronShip);

        state.consumptionPriorityList.push(state.spaceBuildings.SpaceNavBeacon);

        state.consumptionPriorityList.push(state.spaceBuildings.MoonBase);
        state.consumptionPriorityList.push(state.spaceBuildings.MoonIridiumMine);
        state.consumptionPriorityList.push(state.spaceBuildings.MoonHeliumMine);

        state.consumptionPriorityList.push(state.spaceBuildings.GasMining);

        state.consumptionPriorityList.push(state.spaceBuildings.RedSpaceport);
        state.consumptionPriorityList.push(state.spaceBuildings.RedTower);
        state.consumptionPriorityList.push(state.spaceBuildings.RedLivingQuarters);
        state.consumptionPriorityList.push(state.spaceBuildings.RedFabrication);
        state.consumptionPriorityList.push(state.spaceBuildings.RedMine);
        state.consumptionPriorityList.push(state.spaceBuildings.RedBiodome);
        state.consumptionPriorityList.push(state.spaceBuildings.RedExoticLab);

        // Don't need to add Sun as they can't be turned on / off

        state.consumptionPriorityList.push(state.spaceBuildings.GasMoonOilExtractor);

        state.consumptionPriorityList.push(state.spaceBuildings.DwarfEleriumContainer);
        state.consumptionPriorityList.push(state.spaceBuildings.DwarfWorldController);
        state.consumptionPriorityList.push(state.spaceBuildings.RedSpaceBarracks);
        state.consumptionPriorityList.push(state.spaceBuildings.RedFactory);
        state.consumptionPriorityList.push(state.spaceBuildings.MoonObservatory);
        state.consumptionPriorityList.push(state.cityBuildings.TouristCenter);
        state.consumptionPriorityList.push(state.cityBuildings.MassDriver);
    }

    initialiseState();
    
    function updateStateFromSettings() {
        // Retrieve settings for buying and selling tradable resources
        for (let i = 0; i < state.tradableResourceList.length; i++) {
            let resource = state.tradableResourceList[i];
            let sellSettingKey = 'sell' + resource.id;
            if (settings.hasOwnProperty(sellSettingKey)) {
                resource.autoSellEnabled = settings[sellSettingKey];
            } else {
                settings[sellSettingKey] = false;
            }
            let buySettingKey = 'buy' + resource.id;
            if (settings.hasOwnProperty(buySettingKey)) {
                resource.autoBuyEnabled = settings[buySettingKey];
            } else {
                settings[buySettingKey] = false;
            }
        }

        // Retrieve settings for crafting resources
        for (let i = 0; i < state.craftableResourceList.length; i++) {
            let settingKey = 'craft' + state.craftableResourceList[i].id;
            if (settings.hasOwnProperty(settingKey)) {
                state.craftableResourceList[i].autoCraftEnabled = settings[settingKey];
            } else {
                settings[settingKey] = true;
            }
        }
        
        // Retrieve settings for buying buildings resources
        for (let i = 0; i < state.allBuildingList.length; i++) {
            let settingKey = 'bat' + state.allBuildingList[i].id;
            if (settings.hasOwnProperty(settingKey)) {
                state.allBuildingList[i].autoBuildEnabled = settings[settingKey];
            } else {
                settings[settingKey] = true;
            }
        }
    }

    updateStateFromSettings();

    function updateSettingsFromState() {
        for (let i = 0; i < state.allBuildingList.length; i++) {
            settings['bat' + state.allBuildingList[i].id] = state.allBuildingList[i].autoBuildEnabled;
        }
        for (let i = 0; i < state.craftableResourceList.length; i++) {
            settings['craft' + state.craftableResourceList[i].id] = state.craftableResourceList[i].autoCraftEnabled;
        }
        for (let i = 0; i < state.tradableResourceList.length; i++) {
            let resource = state.tradableResourceList[i];
            settings['buy' + resource.id] = resource.autoBuyEnabled;
            settings['sell' + resource.id] = resource.autoSellEnabled;
        }
        if (!settings.hasOwnProperty('autoEvolution')) {
            settings.autoEvolution = false;
        }
        if (!settings.hasOwnProperty('autoMarket')) {
            settings.autoMarket = false;
        }
        if (!settings.hasOwnProperty('autoFight')) {
            settings.autoFight = false;
        }
        if (!settings.hasOwnProperty('autoCraft')) {
            settings.autoCraft = false;
        }
        if (!settings.hasOwnProperty('autoARPA')) {
            settings.autoARPA = false;
        }
        if (!settings.hasOwnProperty('autoBuild')) {
            settings.autoBuild = false;
        }
        if (!settings.hasOwnProperty('autoResearch')) {
            settings.autoResearch = false;
        }
        if (!settings.hasOwnProperty('autoJobs')) {
            settings.autoJobs = false;
        }
        if (!settings.hasOwnProperty('autoPower')) {
            settings.autoPower = false;
        }
        if (!settings.hasOwnProperty('autoTradeSpecialResources')) {
            settings.autoTradeSpecialResources = false;
        }
        if (!settings.hasOwnProperty('autoSmelter')) {
            settings.autoSmelter = false;
        }
        if (!settings.hasOwnProperty('autoFactory')) {
            settings.autoFactory = false;
        }
        if (!settings.hasOwnProperty('autoMAD')) {
            settings.autoMAD = false;
        }
        if (!settings.hasOwnProperty('autoSpace')) {
            settings.autoSpace = false; // Space currently equals less plasmids so off by default. Also kind of conflicts with MAD don't you think?
        }
        if (!settings.hasOwnProperty('autoSeeder')) {
            settings.autoSeeder = false;
        }
        if (!settings.hasOwnProperty('autoLogging')) {
            settings.autoLogging = false;
        }
        if (!settings.hasOwnProperty('minimumMoney')) {
            settings.minimumMoney = 0;
        }
        if (!settings.hasOwnProperty('arpa')) {
            settings.arpa = {
                lhc: false,
                stock_exchange: false,
                monument: false,
                launch_facility: false,
            };
        }
        localStorage.setItem('settings', JSON.stringify(settings));
    }

    updateSettingsFromState();

    // #endregion State and Initialisation

    //#region Auto Evolution

    function autoEvolution() {
        if ($('#evolution') === null || $('#evolution')[0].style.display === 'none') {
            return;
        }

        // If we have performed a soft reset with a bioseeded ship then we get to choose our planet
        autoPlanetSelection();

        // Gather some resources and evolve (currently targeting Antids)
        autoGatherResource(state.evolutions.Rna, 10);
        autoGatherResource(state.evolutions.Dna, 10);
        
        // If we have performed a soft reset with a bioseeded ship then we get to choose our race directly
        if (state.evolutions.RaceAntids.isUnlocked()) {
            state.evolutions.RaceAntids.click();
            return;
        }

        state.evolutions.Sentience.click();
        state.evolutions.Arthropods.click();
        state.evolutions.BilateralSymmetry.click();
        state.evolutions.Multicellular.click();
        state.evolutions.Phagocytosis.click();
        state.evolutions.SexualReproduction.click();
        
        buildIfCountLessThan(state.evolutions.Membrane, 10);
        buildIfCountLessThan(state.evolutions.Organelles, 15);
        buildIfCountLessThan(state.evolutions.Nucleus, 5);
        buildIfCountLessThan(state.evolutions.EukaryoticCell, 5);
        buildIfCountLessThan(state.evolutions.Mitochondria, 3);
        buildIfCountLessThan(state.evolutions.Membrane, 10);
    }

    function autoPlanetSelection() {
        // This section is for if we bioseeded life and we get to choose our path a little bit
        let potentialPlanets = document.querySelectorAll('#evolution .action');
        let selectedPlanet = "";

        selectedPlanet = evolutionPlanetSelection(potentialPlanets, "Forest");
        if (selectedPlanet === "") { evolutionPlanetSelection(potentialPlanets, "Grassland"); }
        if (selectedPlanet === "") { evolutionPlanetSelection(potentialPlanets, "Oceanic"); }
        if (selectedPlanet === "") { evolutionPlanetSelection(potentialPlanets, "Desert"); }
        if (selectedPlanet === "") { evolutionPlanetSelection(potentialPlanets, "Volcanic"); }
        if (selectedPlanet === "") { evolutionPlanetSelection(potentialPlanets, "Tundra"); }

        // This one is a little bit special. We need to trigger the "mouseover" first as it creates a global javascript varaible
        // that is then destroyed in the "click"
        if (selectedPlanet !== "") {
            let evObj = document.createEvent("Events");
            evObj.initEvent("mouseover", true, false);
            document.getElementById(selectedPlanet).dispatchEvent(evObj);
            // @ts-ignore
            document.getElementById(selectedPlanet).children[0].click()
        }
    }

    function evolutionPlanetSelection (potentialPlanets, planetType) {
        for (let i = 0; i < potentialPlanets.length; i++) {
            if (potentialPlanets[i].id.startsWith(planetType)) {
                // @ts-ignore
                //potentialPlanets[i].children[0].click();
                return potentialPlanets[i].id;
            }
        }

        return "";
    }

    //#endregion Auto Evolution

    //#region Auto Crafting

    function autoCraft() {
        if (!state.resources.Population.isUnlocked()) {
            return;
        }
        
        for (let i = 0; i < state.craftableResourceList.length; i++) {
            let craftable = state.craftableResourceList[i];
            if (!craftable.isUnlocked()) {
                continue;
            }

            if (craftable.autoCraftEnabled) {
                updateCraftRatio(craftable);

                let tryCraft = true;

                //console.log("resource: " + craftable.id + ", length: " + craftable.requiredResources.length);
                for (let i = 0; i < craftable.requiredResourcesToAction.length; i++) {
                    //console.log("resource: " + craftable.id + " required resource: " + craftable.requiredResources[i].id);
                    if (craftable.requiredResourcesToAction[i].storageRatio < craftable.craftRatio) {
                        tryCraft = false;
                    }
                }

                if (tryCraft) {
                    craftable.tryCraftX("5");
                }
            }
        }
    }

    /**
     * @param {Resource} craftable
     */
    function updateCraftRatio(craftable) {
        // We want to get to a healthy number of buildings that require craftable materials so leaving crafting ratio low early
        if (craftable === state.resources.Plywood) {
            craftable.craftRatio = 0.9;
            
            if (state.cityBuildings.Library.count < 20 || state.cityBuildings.Cottage.count < 20) {
                craftable.craftRatio = 0.5;
            }
        }
        
        if (craftable === state.resources.Brick) {
            craftable.craftRatio = 0.9;
            
            if (state.cityBuildings.Library.count < 20 || state.cityBuildings.Cottage.count < 20) {
                craftable.craftRatio = 0.5;
            }
        }
        
        if (craftable === state.resources.WroughtIron) {
            craftable.craftRatio = 0.9;
            
            if (state.cityBuildings.Cottage.count < 20) {
                craftable.craftRatio = 0.5;
            }
        }
        
        if (craftable === state.resources.SheetMetal) {
            craftable.craftRatio = 0.9;
            
            if (state.cityBuildings.Wardenclyffe.count < 20) {
                craftable.craftRatio = 0.5;
            }
        }
    }

    //#endregion Auto Crafting

    //#region Auto Battle

    function autoBattle() {
        if (!state.battle.isUnlocked()) {
            return;
        }

        // Don't send our troops out if we're preparing for MAD as we need all troops at home for maximum plasmids
        if (state.goal === "PreparingMAD") {
            state.battle.hireMercenary(); // but hire mercenaries if we can afford it to get there quicker
            return;
        }
        
        // Don't launch an attack until we are happy with our battalion size (returns true if we've added a battalion)
        if (state.battle.currentSoldiers > state.battle.currentBattalion) {
            if (state.battle.addBattalion()) {
                return;
            }
        }
        
        // If we're switching attack types this loop then don't launch an attack. Wait for the UI to catch up (returns true when we are at the right attack type)
        if (!state.battle.switchToBestAttackType()) {
            return;
        }

        // If we have solders, they're not wounded and they're ready to go, then charge!
        if (state.battle.maxSoldiers !== 0 && state.battle.woundedSoldiers === 0 && state.battle.currentSoldiers === state.battle.maxSoldiers) {
            state.battle.launchCampaign();
        }
    }

    //#endregion Auto Battle
    
    //#region Auto Jobs

    /**
     * @param {string} jobType
     * @return {number}
     */
    function getUnfilledJobsSplit(jobType) {
        if (document.getElementById('civ-' + jobType).style.display !== 'none') {
            let btnArray = document.querySelector('#civ-' + jobType + ' .job_label > span:nth-child(2)').textContent.split(' / ');
            let availableJobs = parseInt(btnArray[1]);
            let filledJobs = parseInt(btnArray[0]);
            
            if (jobType === "miner" || jobType === "banker") {
                if (state.resources.Population.currentQuantity <= 70) {
                    if (availableJobs > 3) {
                        availableJobs = 3;
                    }
                }
            }

            // We don't want more cement workers if we don't have any stone
            if (jobType === "cement_worker" && state.resources.Stone.rateOfChange < 8) {
                return 0;
            }
            
            let unfilledJobs = availableJobs - filledJobs;
            return unfilledJobs;
        }
        
        return 0;
    }
    
    /**
     * @param {string} jobType
     * @return {number}
     */
    function getJobsSingle(jobType) {
        if (document.getElementById('civ-' + jobType).style.display !== 'none') {
            return parseInt(document.querySelector('#civ-' + jobType + ' .job_label > span:nth-child(2)').textContent);
        }
        
        return 0;
    }
    
    /**
     * @param {number} unemployed
     */
    function unassignJobsIfRequired(unemployed) {
        if (document.getElementById('civ-farmer').style.display !== 'none') {
            let farmers = parseInt(document.querySelector('#civ-farmer .job_label > span:nth-child(2)').textContent);

            // If food is critical then add some farmers...
            if (unemployed > 0 && state.resources.Food.rateOfChange < -1 * state.resources.Population.currentQuantity / 10) {
                let farmerAddButton = document.querySelector('#civ-farmer .controls > .add');
                // @ts-ignore
                farmerAddButton.click();
            }

            // If food isn't great and we have less than 10 farmers then add them up to 10
            if (unemployed > 0 && farmers < 10 && state.resources.Food.rateOfChange < 0) {
                let farmerAddButton = document.querySelector('#civ-farmer .controls > .add');
                // @ts-ignore
                farmerAddButton.click();
            }
            
            // If we have an abundence of food then remove some farmers
            if (state.resources.Food.rateOfChange > 10) {
                let farmerSubButton = document.querySelector('#civ-farmer .controls > .sub');
                // @ts-ignore
                farmerSubButton.click();
            }

            // *****************
            // If farmer job is not unlocked then leave as unemployed (especially cath! - get food from unemployed)
            // If no other jobs are unlocked then make them farmers
            // *****************
        }

        // Fire some cement workers if we're not making any stone
        if (state.resources.Stone.rateOfChange < 5) {
            let cementWorkerSubButton = document.querySelector('#civ-cement_worker .controls > .sub');
            // @ts-ignore
            cementWorkerSubButton.click();
        }
        
        if (unemployed > 0) {
            return;
        }
        
        let entertainerUnfilled = getUnfilledJobsSplit("entertainer");
        let scientistUnfilled = getUnfilledJobsSplit("scientist");
        let professorUnfilled = getUnfilledJobsSplit("professor");
        let cement_workerUnfilled = getUnfilledJobsSplit("cement_worker");
        let minerUnfilled = getUnfilledJobsSplit("miner");
        let coal_minerUnfilled = getUnfilledJobsSplit("coal_miner");
        let bankerUnfilled = getUnfilledJobsSplit("banker");
        let colonistUnfilled = getUnfilledJobsSplit("colonist");
        let space_minerUnfilled = getUnfilledJobsSplit("space_miner");
        
        let totalUnfilled = entertainerUnfilled + scientistUnfilled + professorUnfilled + cement_workerUnfilled + minerUnfilled
            + coal_minerUnfilled + bankerUnfilled + colonistUnfilled + space_minerUnfilled;
        
        if (totalUnfilled > 0) {
            let lumberjackFilled = getJobsSingle("lumberjack");
            let quarry_workerFilled = getJobsSingle("quarry_worker");
            
            if (state.resources.Population.currentQuantity > 80 && lumberjackFilled > 10 && lumberjackFilled > quarry_workerFilled + 5) {
                let subButton = document.querySelector('#civ-lumberjack .controls > .sub');
                // @ts-ignore
                subButton.click();
            } else if (lumberjackFilled > 10 && lumberjackFilled > quarry_workerFilled) {
                let subButton = document.querySelector('#civ-lumberjack .controls > .sub');
                // @ts-ignore
                subButton.click();
            } else if (quarry_workerFilled > 10) {
                let subButton = document.querySelector('#civ-quarry_worker .controls > .sub');
                // @ts-ignore
                subButton.click();
            }
        }
    }
    
    function autoJobs() {
        if (!state.resources.Population.isUnlocked()) {
            return;
        }
        
        let unemployed = parseInt(document.querySelector('#civ-free .job_label > span:nth-child(2)').textContent);
        
        unassignJobsIfRequired(unemployed);
        
        if (unemployed > 0)
        {
            clickJobSplitButtonIfRequired("entertainer");
            clickJobSplitButtonIfRequired("scientist");
            clickJobSplitButtonIfRequired("professor");
            clickJobSplitButtonIfRequired("cement_worker");
            
            if (document.getElementById('civ-miner').style.display !== 'none') {
                let minerArray = document.querySelector('#civ-miner .job_label > span:nth-child(2)').textContent.split(' / ');
                
                if (parseInt(minerArray[0]) !== parseInt(minerArray[1]) && (parseInt(minerArray[0]) < 3 || state.resources.Population.currentQuantity > 70))
                {
                    let minerAddButton = document.querySelector('#civ-miner .controls > .add');
                    // @ts-ignore
                    minerAddButton.click();
                }
            }
            
            clickJobSplitButtonIfRequired("coal_miner");
            
            if (document.getElementById('civ-banker').style.display !== 'none') {
                let bankerArray = document.querySelector('#civ-banker .job_label > span:nth-child(2)').textContent.split(' / ');
                
                if (parseInt(bankerArray[0]) !== parseInt(bankerArray[1]) && (parseInt(bankerArray[0]) < 3 || state.resources.Population.currentQuantity > 70))
                {
                    let bankerAddButton = document.querySelector('#civ-banker .controls > .add');
                    // @ts-ignore
                    bankerAddButton.click();
                }
            }
            
            clickJobSplitButtonIfRequired("colonist");
            clickJobSplitButtonIfRequired("space_miner");
            
            let lumberjackFilled = getJobsSingle("lumberjack");
            let quarry_workerFilled = getJobsSingle("quarry_worker");
            
            if (document.getElementById('civ-lumberjack').style.display !== 'none') {
                if (lumberjackFilled <= quarry_workerFilled) {
                    let lumberjackAddButton = document.querySelector('#civ-lumberjack .controls > .add');
                    // @ts-ignore
                    lumberjackAddButton.click();
                    return;
                } else if (state.resources.Population.currentQuantity > 100 && lumberjackFilled <= quarry_workerFilled + 5) {
                    let lumberjackAddButton = document.querySelector('#civ-lumberjack .controls > .add');
                    // @ts-ignore
                    lumberjackAddButton.click();
                    return;
                }
            }
            
            if (document.getElementById('civ-quarry_worker').style.display !== 'none') {
                let quarryWorkerAddButton = document.querySelector('#civ-quarry_worker .controls > .add');
                // @ts-ignore
                quarryWorkerAddButton.click();
            }
        }
    }
    
    /**
     * @param {string} jobType
     */
    function clickJobSplitButtonIfRequired(jobType) {
        // We don't want more cement workers if we're not making any stone
        if (jobType === "cement_worker" && state.resources.Stone.rateOfChange < 8) {
            return;
        }

        if (document.getElementById('civ-' + jobType).style.display !== 'none')
        {
            let btnArray = document.querySelector('#civ-' + jobType + ' .job_label > span:nth-child(2)').textContent.split(' / ');
            
            if (parseInt(btnArray[0]) !== parseInt(btnArray[1]))
            {
                let jobAddButton = document.querySelector('#civ-' + jobType + ' .controls > .add');
                // @ts-ignore
                jobAddButton.click();
            }
        }
    }

    //#endregion Auto Jobs
    
    //#region Auto Smelter

    function autoSmelter() {
        // No smelter; no auto smelter. No soup for you.
        if (!state.cityBuildings.Smelter.isUnlocked()) {
            return;
        }

        // If the window is open then update our options
        if (state.cityBuildings.Smelter.isOptionsOpen()) {
            state.cityBuildings.Smelter.updateOptions();
        }

        // We have a smelter but not the technology to smelt steel so there is nothing to automate
        if (!state.cityBuildings.Smelter.isSmeltingUnlocked(SmelterSmeltingTypes.Steel)) {
            return;
        }

        // User opened the modal - don't interfere with what they're doing
        if (state.modal.isOpen() && !state.modal.openedByScript) {
            return;
        }
        
        // If there is already another modal window open then we can't also open the smelters modal window
        if (state.modal.isOpen() && state.modal.currentModalWindowTitle !== "Smelter") {
            return;
        }

        // Check our cached numbers - if there is nothing to adjust then don't
        // If we don't have any cached numbers then continue to updating our numbers
        if (state.cityBuildings.Smelter.isUpdated) {
            let smelterIronCount = state.cityBuildings.Smelter.smeltingCount(SmelterSmeltingTypes.Iron);
            let smelterSteelCount = state.cityBuildings.Smelter.smeltingCount(SmelterSmeltingTypes.Steel);

            // The number of buildings hasn't changed so check if we need to adjust. Otherwise continue to updating our numbers
            if (state.cityBuildings.Smelter.count === smelterIronCount + smelterSteelCount) {
                let maxAllowedSteel = state.cityBuildings.Smelter.count;
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
                let desiredSteelCount = state.cityBuildings.Smelter.count;

                if (state.cityBuildings.Cottage.count < 15) {
                    // half to steel with any remainder going to steel
                    desiredSteelCount = Math.ceil(state.cityBuildings.Smelter.count / 2);
                } else if (state.cityBuildings.CoalMine.count < 10) {
                    // two thirds to steel with any remainder going to steel
                    desiredSteelCount = Math.ceil(state.cityBuildings.Smelter.count * 2 / 3);
                } else if (smelterIronCount >= 2) {
                    desiredSteelCount = state.cityBuildings.Smelter.count - 2;
                }

                // We'll take the minium of our desired and maximum allowed steel
                if (desiredSteelCount > maxAllowedSteel) { desiredSteelCount = maxAllowedSteel; }
                let adjustmentToSteelCount = desiredSteelCount - smelterSteelCount;

                // Only bother adjusting if it is more than 1 off, otherwise don't open the window
                if (!state.modal.isOpen()) {
                    if (adjustmentToSteelCount >= -1 && adjustmentToSteelCount <= 1) {
                        return;
                    }
                } else {
                    // Window is open so perform adjustments
                    if (adjustmentToSteelCount > 0) {
                        state.cityBuildings.Smelter.increaseSmelting(SmelterSmeltingTypes.Steel, adjustmentToSteelCount);
                    }

                    if (adjustmentToSteelCount < 0) {
                        state.cityBuildings.Smelter.increaseSmelting(SmelterSmeltingTypes.Iron, adjustmentToSteelCount * -1);
                    }

                    state.modal.closeModalWindow();
                    return;
                }
            }
        }

        // We want to adjust the smelters iron / steel production so open the smelter options, update our cached numbers and adjust if required
        // Open the modal in the first loop
        // Update our numbers and perform the adjustment and close the modal in the second loop
        if (!state.modal.isOpen() && state.cityBuildings.Smelter.hasOptions()) {
            state.cityBuildings.Smelter.openOptions();
            return
        }
    }

    //#endregion Auto Smelter
    
    //#region Auto Factory

    function autoFactory() {
        // No factory; no auto factory
        if (!state.cityBuildings.Factory.isUnlocked()) {
            return;
        }

        // If the window is open then update our options
        if (state.cityBuildings.Factory.isOptionsOpen()) {
            state.cityBuildings.Factory.updateOptions();
        }

        // User opened the modal - don't interfere with what they're doing
        if (state.modal.isOpen() && !state.modal.openedByScript) {
            return;
        }
        
        // Only one modal window can be open at a time
        // If there is already another modal window open then we can't also open the factories modal window
        if (state.modal.isOpen() && state.modal.currentModalWindowTitle !== "Factory") {
            return;
        }

        if (state.cityBuildings.Factory.isUpdated) {
            let remainingOperatingFactories = { quantity: state.cityBuildings.Factory.maxOperating, };
            let productionChanges = [];
    
            // Produce as many nano-tubes as is reasonable, then alloy, then polymer and finally luxury goods
            // Realistically it will only get through to nano tubes and alloy
            updateProductionChange(productionChanges, remainingOperatingFactories, state.resources.NanoTube, FactoryGoods.NanoTube);
            updateProductionChange(productionChanges, remainingOperatingFactories, state.resources.Alloy, FactoryGoods.Alloy);
            updateProductionChange(productionChanges, remainingOperatingFactories, state.resources.Polymer, FactoryGoods.Polymer);
            updateProductionChange(productionChanges, remainingOperatingFactories, state.resources.LuxuryGoods, FactoryGoods.LuxuryGoods);
    
            if (!state.modal.isOpen()) {
                // If there aren't any changes required then don't open the modal window
                if (productionChanges.length === 0) {
                    return;
                }

                let minChange = 0;
                let maxChange = 0;

                for (let i = 0; i < productionChanges.length; i++) {
                    let productionChange = productionChanges[i];
                    minChange = Math.min(minChange, productionChange.quantity);
                    maxChange = Math.max(maxChange, productionChange.quantity);
                }

                // Only bother adjusting if it is more than 1 off, otherise don't open the window
                if (minChange >= -1 && maxChange <= 1) {
                    return;
                }
            } else {
                // First decrease any production so that we have room to increase others
                for (let i = 0; i < productionChanges.length; i++) {
                    let productionChange = productionChanges[i];
                    if (productionChange.quantity < 0) { state.cityBuildings.Factory.decreaseProduction(productionChange.factoryGoods, productionChange.quantity * -1) }
                }
        
                // Increase any production required (if they are 0 then don't do anything with them)
                for (let i = 0; i < productionChanges.length; i++) {
                    let productionChange = productionChanges[i];
                    if (productionChange.quantity > 0) { state.cityBuildings.Factory.increaseProduction(productionChange.factoryGoods, productionChange.quantity) }
                }

                state.modal.closeModalWindow();
                return;
            }
        }

        // We want to adjust the factory production so open the factory options and adjust
        // Open the modal in the first loop
        // Perform the adjustment and close the modal in the second loop
        if (!state.modal.isOpen() && state.cityBuildings.Factory.hasOptions()) {
            state.cityBuildings.Factory.openOptions();
            return;
        }
    }

    /**
     * @param {{ factoryGoods: number; quantity: number; }[]} productionChanges
     * @param {{ quantity: number; }} remainingOperatingFactories
     * @param {Resource} resource
     * @param {number} factoryGoods
     */
    function updateProductionChange(productionChanges, remainingOperatingFactories, resource, factoryGoods) {
        if (!state.cityBuildings.Factory.isProductionUnlocked(factoryGoods)) {
            return;
        }

        let minimumAllowedProduction = remainingOperatingFactories.quantity; // Can't have more than our total!

        // We're going to check if we are limited by anything that goes into producing the resource.
        // We want to take the highest number we can produce without going over our minimums
        for (let i = 0; i < resource.productionCost.length; i++) {
            let productionCost = resource.productionCost[i];
            let adjustedRateOfChange = productionCost.resource.rateOfChange + (state.cityBuildings.Factory.currentProduction(factoryGoods) * productionCost.quantity);
            let maxForResource = Math.floor((adjustedRateOfChange - productionCost.minRateOfChange) / productionCost.quantity);

            if (maxForResource < 0) { maxForResource = 0; }

            if (maxForResource < minimumAllowedProduction) {
                minimumAllowedProduction = maxForResource;
            }
        }
        
        let differenceInProduction = minimumAllowedProduction - state.cityBuildings.Factory.currentProduction(factoryGoods);
        remainingOperatingFactories.quantity -= minimumAllowedProduction;

        if (differenceInProduction !== 0) {
            productionChanges.push( { factoryGoods: factoryGoods, quantity: differenceInProduction } );
        }
    }

    //#endregion Auto Factory
    
    //#region Auto MAD

    function autoMAD() {
        // Don't MAD if it isn't unlocked
        if (document.getElementById("mad").style.display === "none") {
            return;
        }

        if (!state.resources.Population.isUnlocked()) {
            return;
        }
        
        // Let's wait until we have a good enough population count
        if (state.goal !== "PreparingMAD" && state.resources.Plasmids.currentQuantity < 500 && state.resources.Population.currentQuantity < 210) {
            return;
        } else if (state.goal !== "PreparingMAD" && state.resources.Plasmids.currentQuantity >= 500 && state.resources.Population.currentQuantity < 245) {
            return;
        }
        
        // Can't kill ourselves if we don't have nukes yet...
        let armMissilesBtn = document.querySelector('#mad button.arm');
        if (state.goal !== "PreparingMAD" && armMissilesBtn === null) {
            return;
        }
        
        let launchMissilesBtn = document.querySelector('#mad > div > div:nth-child(3) .button');
        
        if (state.goal !== "PreparingMAD" || (state.goal === "PreparingMAD" && launchMissilesBtn["disabled"])) {
            // @ts-ignore
            armMissilesBtn.click();
            state.goal = "PreparingMAD";
            return; // Give the UI time to update
        }
        
        if (state.battle.currentSoldiers === state.battle.maxSoldiers && state.battle.woundedSoldiers === 0) {
            // Push... the button
            console.log("Soft resetting game with MAD");
            state.goal = "GameOverMan";
            // @ts-ignore
            launchMissilesBtn.click();
        }
    }

    //#endregion Auto MAD

    //#region Auto Seeder Ship

    function autoSeeder() {
        if (!state.spaceBuildings.GasSpaceDock.isUnlocked() || state.spaceBuildings.GasSpaceDock.count < 1) {
            return;
        }

        // We want to have a good population level before resetting
        if (state.resources.Population.currentQuantity < 400) {
            return;
        }

        // We want at least 4 probes and a completed ship
        if (state.spaceBuildings.GasSpaceDock.lastProbeCount < 4 || state.spaceBuildings.GasSpaceDock.lastShipSegmentCount < 100) {
            return;
        }

        // Only one modal window can be open at a time
        // If there is already another modal window open then we can't also open the space dock modal window
        if (state.modal.isOpen() && state.modal.currentModalWindowTitle !== "Space Dock") {
            return;
        }

        // Let's do this!
        if (!state.modal.isOpen()) {
            state.goal = "LaunchingSeeder";
            state.spaceBuildings.GasSpaceDock.openOptions();
            return;
        }

        console.log("Soft resetting game with BioSeeder ship");
        state.spaceBuildings.GasSpaceDock.tryLaunchShip();
    }

    //#endregion Auto Seeder Ship
    
    //#region Auto Space

    function autoSpace() {
        // Let's wait until we have a good enough population count
        if (state.resources.Population.currentQuantity < 250) {
            return;
        }
        
        settings.arpa.launch_facility = true;
    }

    //#endregion Auto Space

    //#region Auto Market

    /**
     * @param {boolean} [bulkSell]
     * @param {boolean} [ignoreSellRatio]
     */
    function autoMarket(bulkSell, ignoreSellRatio) {
        let currentMoney = state.resources.Money.currentQuantity;
        let multipliers = $('#market-qty').children();
        let tradeQuantity = 1000;
        
        if (multipliers.length >= 5 && !multipliers[4].children[0].checked) {
            // Set trade value to be 1000x. We'll come back next loop to do the trade
            multipliers[4].click();
            return;
        }
        else if (multipliers.length < 5 && !multipliers[2].children[0].checked) {
            // Set trade value to be 100x. We'll come back next loop to do the trade
            multipliers[2].click();
            tradeQuantity = 100;
            return;
        }
        
        for (let i = 0; i < state.tradableResourceList.length; i++) {
            let resource = state.tradableResourceList[i];
            let currentResourceQuantity = resource.currentQuantity;

            if (!resource.isUnlocked() || !resource.isTradable()) {
                continue;
            }
            
            if (resource.autoSellEnabled === true && (ignoreSellRatio ? true : resource.storageRatio > resource.sellRatio)) {
                let sellBtn = $('#market-' + resource.id + ' .order')[1];
                let value = sellBtn.textContent.substr(1);
                let sellValue = getRealNumber(value);
                let counter = 0;

                while(true) {
                    // break if not enough resource or not enough money storage
                    if (currentMoney + sellValue >= state.resources.Money.maxQuantity || currentResourceQuantity - tradeQuantity <= 0 || counter++ > 10) {
                        break;
                    }

                    currentMoney += sellValue;
                    currentResourceQuantity -= tradeQuantity;
                    sellBtn.click();
                }
            }

            if (bulkSell === true) {
                continue;
            }

            if (resource.autoBuyEnabled === true && resource.storageRatio < resource.buyRatio) {
                let buyBtn = $('#market-' + resource.id + ' .order')[0];
                let value = buyBtn.textContent.substr(1);
                let buyValue = getRealNumber(value);
                let counter = 0;

                while(true) {
                    // break if not enough money or not enough resource storage
                    if (currentMoney - buyValue <= settings.minimumMoney || resource.currentQuantity + tradeQuantity > resource.maxQuantity - 3 * tradeQuantity || counter++ > 2) {
                        break;
                    }

                    currentMoney -= buyValue;
                    currentResourceQuantity += tradeQuantity;
                    buyBtn.click();
                }
            }
        }
    }

    //#endregion Auto Market
    
    //#region Auto Building

    /**
     * @param {Action} building
     * @param {Resource} requiredResource
     * @param {number} requiredProduction
     */
    function buildIfEnoughProduction(building, requiredResource, requiredProduction) {
        if (building.autoBuildEnabled && requiredResource.rateOfChange > requiredProduction) {
            building.tryBuild();
            return;
        }
    }
    
    function autoGatherResources() {
        // Don't spam click once we've got a bit of population going
        if (state.resources.Population.currentQuantity > 15) {
            return;
        }
        
        autoGatherResource(state.cityBuildings.Food, 10);
        autoGatherResource(state.cityBuildings.Lumber, 10);
        autoGatherResource(state.cityBuildings.Stone, 10);
    }
    
    /**
     * @param {Action} gatherable
     * @param {number} nbrOfClicks
     */
    function autoGatherResource(gatherable, nbrOfClicks) {
        if (!gatherable.isUnlocked()) {
            return;
        }

        for (let i = 0; i < nbrOfClicks; i++) {
            gatherable.click();
        }
    }
    
    /**
     * @param {Action} building
     * @param {number} count
     */
    function buildIfCountLessThan(building, count) {
        // If we have less than what we want then try to buy it
        if (building.count < count) {
            building.tryBuild();
        }
    }

    function autoBuildSpaceDockChildren() {
        if (!state.spaceBuildings.GasSpaceDock.isUnlocked() || state.spaceBuildings.GasSpaceDock.count < 1 || state.goal === "LaunchingSeeder") {
            return;
        }

        // User opened the modal - don't interfere with what they're doing
        if (state.modal.isOpen() && !state.modal.openedByScript) {
            return;
        }

        // We don't want more than 4 probes or more than 100 ship segments
        if (state.spaceBuildings.GasSpaceDock.lastProbeCount >= 4 && state.spaceBuildings.GasSpaceDock.lastShipSegmentCount >= 100) {
            return;
        }

        // Only one modal window can be open at a time
        // If there is already another modal window open then we can't also open the space dock modal window
        if (state.modal.isOpen() && state.modal.currentModalWindowTitle !== "Space Dock") {
            return;
        }

        // This one involves opening options so don't do it too often
        if (!state.spaceBuildings.GasSpaceDock.isOptionsOpen() && state.loopCounter % 500 !== 0 && state.spaceBuildings.GasSpaceDock.isOptionsUpdated()) {
            return;
        }

        // We want to try to build some space dock children... The little rascals!
        // Open the modal in the first loop
        // Try to build and close the modal in the second loop
        if (!state.modal.isOpen()) {
            state.spaceBuildings.GasSpaceDock.openOptions();
            return;
        }

        // We've opened the options window so lets update where we are currently
        state.spaceBuildings.GasSpaceDock.updateOptions();

        // We want to build 4 probes max
        if (state.spaceBuildings.GasSpaceDock.lastProbeCount < 4) {
            state.spaceBuildings.GasSpaceDock.tryBuildProbe();
        }

        // We want to build 100 ship segments max
        if (state.spaceBuildings.GasSpaceDock.lastShipSegmentCount < 100) {
            state.spaceBuildings.GasSpaceDock.tryBuildShipSegment();
        }

        state.modal.closeModalWindow();
    }
    
    function autoBuild() {
        autoGatherResources();
        
        let targetBuilding = null;

        // Special for very beginning of game - If we've unlocked cement plants but don't have any yet then buy at least 2
        if (state.cityBuildings.CementPlant.autoBuildEnabled && state.cityBuildings.CementPlant.isUnlocked() && state.cityBuildings.CementPlant.count < 2) {
            state.cityBuildings.CementPlant.tryBuild();
            return;
        }

        // A bit of trickery early game to get our craftables up. Once we reach 8 amphitheatre's and have < 10 libraries then wait for
        // crafting to catch up again (or less than 10 cottages, or less than 5 coal mines)
        if (state.cityBuildings.Amphitheatre.count > 7  && state.cityBuildings.Amphitheatre.count < 11) {
            log("Checking for early game target building");
            if (state.cityBuildings.Library.autoBuildEnabled && state.cityBuildings.Library.isUnlocked()) {
                state.cityBuildings.Library.tryBuild();
                if (state.cityBuildings.Library.count < 10) {
                    log("Target building: library");
                    targetBuilding = state.cityBuildings.Library;
                }
            }

            if (targetBuilding === null && state.cityBuildings.Cottage.autoBuildEnabled && state.cityBuildings.Cottage.isUnlocked()) {
                state.cityBuildings.Cottage.tryBuild();
                if (state.cityBuildings.Cottage.count < 10) {
                    log("Target building: cottage");
                    targetBuilding = state.cityBuildings.Cottage;
               }
            }
            
            if (targetBuilding === null && state.cityBuildings.CoalMine.autoBuildEnabled && state.cityBuildings.CoalMine.isUnlocked()) {
                state.cityBuildings.CoalMine.tryBuild();
                if (state.cityBuildings.CoalMine.count < 5) {
                    log("Target building: coal mine");
                    targetBuilding = state.cityBuildings.CoalMine;
               }
            }

            if (targetBuilding === null && state.cityBuildings.StorageYard.autoBuildEnabled && state.cityBuildings.StorageYard.isUnlocked()) {
                state.cityBuildings.StorageYard.tryBuild();
                if (state.cityBuildings.StorageYard.count < 5) {
                    log("Target building: freight yard");
                    targetBuilding = state.cityBuildings.StorageYard;
               }
            }
        }

        // Loop through the auto build list and try to buy them
        for(let i = 0; i < state.allBuildingList.length; i++) {
            let building = state.allBuildingList[i];

            if (!building.autoBuildEnabled) {
                continue;
            }

            // We specifically want to build a target building. Don't build anything else that uses the same resources
            if (targetBuilding !== null) {
                if (targetBuilding.requiredBasicResourcesToAction.some(r => building.requiredBasicResourcesToAction.includes(r))) {
                    log(building.id + " DOES conflict with target building " + targetBuilding.id);
                    continue;
                } else {
                    log(building.id + " DOES NOT conflict with target building " + targetBuilding.id);
                }
            }

            // Only build the following buildings if we have enough production to cover what they use
            if (building === state.cityBuildings.Smelter) {
                buildIfEnoughProduction(building, state.resources.Lumber, 12);
                continue;
            }

            if (building === state.cityBuildings.CoalPower) {
                if (state.resources.Plasmids.currentQuantity > 0) {
                    buildIfEnoughProduction(building, state.resources.Coal, 2.35);
                } else {
                    buildIfEnoughProduction(building, state.resources.Coal, 0.5); // If we don't have plasmids then have to go much lower
                }

                continue;
            }

            if (building === state.cityBuildings.Apartment) {
                if (state.resources.Plasmids.currentQuantity < 500) {
                    buildIfCountLessThan(building, state.cityBuildings.CoalPower.count);
                    continue;
                }
            }

            if (!settings.autoSpace && state.resources.Plasmids.currentQuantity > 2000 && building === state.cityBuildings.OilPower) {
                buildIfCountLessThan(building, 5);
                continue;
            } else if (state.resources.Plasmids.currentQuantity < 500 && building === state.cityBuildings.OilPower) {
                buildIfEnoughProduction(building, state.resources.Oil, 1);
                continue;
            } else if (building === state.cityBuildings.OilPower) {
                buildIfEnoughProduction(building, state.resources.Oil, 2.65);
                continue;
            }

            if (building === state.cityBuildings.FissionPower) {
                buildIfEnoughProduction(building, state.resources.Uranium, 0.5);
                continue;
            }

            // If we're not going to space and we have a lot of plasmids then we don't need as many buildings. In fact, too many will slow us down
            if (!settings.autoSpace && state.resources.Plasmids.currentQuantity > 2000 && building === state.cityBuildings.OilWell) {
                buildIfCountLessThan(building, 5);
                continue;
            }
            if (!settings.autoSpace && state.resources.Plasmids.currentQuantity > 2000 && building === state.cityBuildings.OilDepot) {
                buildIfCountLessThan(building, 2);
                continue;
            }
            if (!settings.autoSpace && state.resources.Plasmids.currentQuantity > 500 && building === state.cityBuildings.Wharf) {
                buildIfCountLessThan(building, 2);
                continue;
            }

            if (building === state.spaceBuildings.GasSpaceDock) {
                building.tryBuild();
                autoBuildSpaceDockChildren();
                continue;
            }
            
            building.tryBuild();
        }
    }

    //#endregion Auto Building

    //#region Auto Research

    function autoResearch() {
        let items = document.querySelectorAll('#tech .action');
        for (let i = 0; i < items.length; i++) {
            if (items[i].className.indexOf("cna") < 0) {
                if (settings.autoSpace) {
                    // If we're going to space then research fanatacism
                    // Also, don't reject world unity. We want the +25% resource bonus
                    if (items[i].id !== "tech-anthropology" && items[i].id !== "tech-wc_reject") {
                        // @ts-ignore
                        items[i].children[0].click();
                        continue;
                    }
                } else {
                    // If we're not going to space then research anthropology
                    if (items[i].id !== "tech-fanaticism") {
                        // @ts-ignore
                        items[i].children[0].click();
                        continue;
                    }
                }
            }
        }
    }

    //#endregion Auto Research

    //#region Auto ARPA

    function autoArpa() {
        if (settings.arpa.lhc) {
            let btn = document.querySelector("#arpalhc > div.buy > button.button.x1");
            if (btn !== null && !wouldBreakMoneyFloor(26500)) {
                // @ts-ignore
                btn.click();
            }
        }
        if (settings.arpa.stock_exchange) {
            let btn = document.querySelector("#arpastock_exchange > div.buy > button.button.x1");
            if (btn !== null && ! wouldBreakMoneyFloor(30000)) {
                // @ts-ignore
                btn.click();
            }
        }
        if (settings.arpa.monument) {
            let btn = document.querySelector("#arpamonument > div.buy > button.button.x1");
            if (btn !== null) {
                // @ts-ignore
                btn.click();
            }
        }
        if (settings.arpa.launch_facility) {
            let btn = document.querySelector("#arpalaunch_facility > div.buy > button.button.x1");
            if (btn !== null) {
                // @ts-ignore
                btn.click();
            }
        }
        
        // Always sequence genome if possible
        let sequenceBtn = document.querySelector("#arpaSequence .button");
        if (sequenceBtn !== null) {
            let sequenceValue = document.querySelector("#arpaSequence .progress")["value"];
            
            if (sequenceValue === state.lastGenomeSequenceValue) {
                // @ts-ignore
                sequenceBtn.click();
            }
            
            state.lastGenomeSequenceValue = sequenceValue;
        }
    }

    //#endregion Auto ARPA
    
    //#region Auto Power

    //var autoBuildingPriorityLoggedOnce = false;

    function autoBuildingPriority() {
        let availablePowerNode = document.querySelector('#powerMeter');
        
        // Only start doing this once power becomes available. Isn't useful before then
        if (availablePowerNode === null) {
            return;
        }
        
        // Calculate the available power / resource rates of change that we have to work with
        let availablePower = parseInt(availablePowerNode.textContent);
        let spaceFuelMultiplier = 0.95 ** state.cityBuildings.MassDriver.stateOnCount;

        for (let i = 0; i < state.allResourceList.length; i++) {
            state.allResourceList[i].calculatedRateOfChange = state.allResourceList[i].rateOfChange;
        }

        for (let i = 0; i < state.consumptionPriorityList.length; i++) {
            let building = state.consumptionPriorityList[i];
            availablePower += (building.consumption.power * building.stateOnCount);

            for (let j = 0; j < building.consumption.resourceTypes.length; j++) {
                let resourceType = building.consumption.resourceTypes[j];

                // Mass driver effect
                if (resourceType.resource === state.resources.Oil || resourceType.resource === state.resources.Helium_3) {
                    resourceType.rate = resourceType.initialRate * spaceFuelMultiplier;
                }
                
                // Just like for power, get our total resources available
                resourceType.resource.calculatedRateOfChange += resourceType.rate * building.stateOnCount;
            }
        }

        //if (!autoBuildingPriorityLoggedOnce) console.log("starting available power: " + availablePowerNode.textContent);
        //if (!autoBuildingPriorityLoggedOnce) console.log("available power: " + availablePower);

        // Start assigning buildings from the top of our priority list to the bottom
        for (let i = 0; i < state.consumptionPriorityList.length; i++) {
            let building = state.consumptionPriorityList[i];
            let requiredStateOn = 0;

            // Some buildings have state that turn on later... ignore them if they don't have state yet!
            if (!building.hasState()) {
                continue;
            }

            for (let j = 0; j < building.count; j++) {
                if (building.consumption.power > 0) {
                    // Building needs power and we don't have any
                    if ((availablePower <= 0 && building.consumption.power > 0) || (availablePower - building.consumption.power < 0)) {
                        continue;
                    }
                }

                let resourcesToTake = 0;

                for (let k = 0; k < building.consumption.resourceTypes.length; k++) {
                    let resourceType = building.consumption.resourceTypes[k];
                    
                    // TODO: Implement minimum rates of change for each resource
                    // If resource rate is negative then we are gaining resources. So, only check if we are consuming resources
                    if (resourceType.rate > 0) {
                        if (resourceType.resource.calculatedRateOfChange <= 0 || resourceType.resource.calculatedRateOfChange - resourceType.rate < 0) {
                            continue;
                        }
                    }

                    resourcesToTake++;
                }

                // All resources passed the test so take them.
                if ( resourcesToTake === building.consumption.resourceTypes.length) {
                    availablePower -= building.consumption.power;
                    //if (!autoBuildingPriorityLoggedOnce) console.log("building " + building.id + " taking power " + building.consumption.power + " leaving " + availablePower);

                    for (let k = 0; k < building.consumption.resourceTypes.length; k++) {
                        let resourceType = building.consumption.resourceTypes[k];
                        resourceType.resource.calculatedRateOfChange -= resourceType.rate;
                    }

                    requiredStateOn++;
                } else {
                    // We couldn't get the resources so skip the rest of this building type
                    break;
                }
            }

            let adjustment = requiredStateOn - building.stateOnCount;
            //if (!autoBuildingPriorityLoggedOnce) console.log("building " + building.id + " adjustment " + adjustment);

            // If the warning indicator is on then we don't know how many buildings are over-resourced
            // Just take them all off and sort it out next loop
            if (building.isStateOnWarning()) {
                adjustment = -building.stateOnCount;
            }

            if (adjustment !== 0 && (building === state.cityBuildings.Factory || building === state.spaceBuildings.RedFactory)) {
                state.cityBuildings.Factory.isUpdated = false;
            }

            building.tryAdjustState(adjustment);
        }

        //autoBuildingPriorityLoggedOnce = true;
    }

    //#endregion Auto Power
    
    //#region Auto Trade Specials

    /**
     * @param {Resource} resource
     * @param {number} requiredRoutes
     */
    function autoTradeResource(resource, requiredRoutes) {
        if (!resource.isUnlocked() || !resource.isTradable()) {
            return;
        }

        let resourceTradeNode = document.getElementById('market-' + resource.id);
        if (resourceTradeNode !== null && resourceTradeNode.style.display !== 'none') {
            resourceTradeNode = resourceTradeNode.querySelector('.trade');
            let currentTrade = parseInt(resourceTradeNode.querySelector(".current").textContent);
            if (currentTrade < requiredRoutes) {
                // @ts-ignore
                resourceTradeNode.querySelector("span:nth-child(2) .sub .route").click();
            }
        }
    }

    /**
     * @param {Resource} resource
     * @param {number} requiredRoutes
     */
    function autoTradeBalanceResource(resource, requiredRoutes) {
        // This is the same function as autoTradeResource except that it will set trade to be = rather than only add to trade
        if (!resource.isUnlocked() || !resource.isTradable()) {
            return;
        }

        let resourceTradeNode = document.getElementById('market-' + resource.id);
        if (resourceTradeNode !== null && resourceTradeNode.style.display !== 'none') {
            resourceTradeNode = resourceTradeNode.querySelector('.trade');
            let currentTrade = parseInt(resourceTradeNode.querySelector(".current").textContent);
            if (currentTrade < requiredRoutes) {
                // @ts-ignore
                resourceTradeNode.querySelector("span:nth-child(2) .sub .route").click();
            } else if (currentTrade > requiredRoutes) {
                // @ts-ignore
                resourceTradeNode.querySelector("span:nth-child(4) .add .route").click();
            }
        }
    }
    
    function autoTradeSpecialResources() {
        // Some special logic for if we aren't making much money
        if (state.resources.Money.rateOfChange < 200) {
            if (state.resources.Money.storageRatio < 0.2) {
                autoTradeBalanceResource(state.resources.Titanium, 0);
                autoTradeBalanceResource(state.resources.Alloy, 0);
                autoTradeBalanceResource(state.resources.Polymer, 0);
                autoTradeBalanceResource(state.resources.Iridium, 0);
            } else if (state.resources.Money.storageRatio > 0.6) {
                autoTradeResource(state.resources.Titanium, 1);
                autoTradeResource(state.resources.Alloy, 1);
                autoTradeResource(state.resources.Polymer, 1);
                autoTradeResource(state.resources.Iridium, 1);
            }
        } else {
            // Automatically trade for easier resources
            if (state.resources.Plasmids.currentQuantity !== 0) {
                autoTradeResource(state.resources.Titanium, 5);
            } else {
                autoTradeResource(state.resources.Titanium, 1);
            }

            if (state.resources.Plasmids.currentQuantity > 0 && state.resources.Population.currentQuantity < 220) {
                autoTradeResource(state.resources.Alloy, 5);
            } else if (state.resources.Plasmids.currentQuantity > 0) {
                autoTradeResource(state.resources.Alloy, 10);
            } else {
                autoTradeResource(state.resources.Alloy, 1);
            }

            autoTradeResource(state.resources.Polymer, 5);
            autoTradeResource(state.resources.Iridium, 5);
        }
        
        if (state.resources.Plasmids.currentQuantity < 500) {
            // If you don't have many plasmids then you need quite a few crates
            if (assignCrates(state.resources.Steel, 50)) { return }
        } else if(state.cityBuildings.Wardenclyffe.count >= 12) {
            // Slow down steel a bit so that we can build a few Wardenclyffe's before other steel related structures
            if (assignCrates(state.resources.Steel, 20)) { return }
        } else {
            if (assignCrates(state.resources.Steel, 10)) { return }
        }

        if (assignCrates(state.resources.Titanium, 20)) { return }
        if (assignCrates(state.resources.Alloy, 20)) { return }
        if (assignCrates(state.resources.Polymer, 20)) { return }

        if (settings.autoSpace) {
            if (assignCrates(state.resources.Iridium, 20)) { return }

            if (state.resources.Population.currentQuantity > 380) {
                if (assignCrates(state.resources.Steel, 400)) { return }
                if (assignCrates(state.resources.Titanium, 200)) { return }
                if (assignCrates(state.resources.Alloy, 200)) { return }
                if (assignCrates(state.resources.Polymer, 200)) { return }
                if (assignCrates(state.resources.Iridium, 200)) { return }
            } else if (state.resources.Population.currentQuantity > 280) {
                if (assignCrates(state.resources.Steel, 200)) { return }
                if (assignCrates(state.resources.Titanium, 100)) { return }
                if (assignCrates(state.resources.Alloy, 100)) { return }
                if (assignCrates(state.resources.Polymer, 100)) { return }
                if (assignCrates(state.resources.Iridium, 100)) { return }
            }
        }
    }
    
    /**
     * @param {Resource} resource
     * @param {number} nbrCrates
     * @return {boolean} true if no further crate assignment can be done this loop; false otherwise
     */
    function assignCrates(resource, nbrCrates) {
        // Can't assign crate if the resource doesn't exist or doesn't have options
        log("resource: " + resource.id);
        if (!resource.isUnlocked() || !resource.hasOptions()) {
            log("resource: " + resource.id + ", not unlocked");
            return false;
        }

        // User opened the modal - don't interfere with what they're doing
        if (state.modal.isOpen() && !state.modal.openedByScript) {
            return true;
        }

        // We already have more crates assigned to this resource than what is being requested
        if (resource.isAssignedCratesUpdated && resource.assignedCrates >= nbrCrates) {
            log("resource: " + resource.id + ", enough crates 1, assigned: " + resource.assignedCrates);
            return false;
        }
        
        // There can only be one modal active at a time. If there is another modal active then don't continue
        if (state.modal.isOpen() && state.modal.currentModalWindowTitle !== resource.id) {
            log("resource: " + resource.id + ", other modal active: " + state.modal.currentModalWindowTitle);
            return false;
        }

        // If the resources lastConstructStorageAttemptLoopCounter is not 0 then we are attempting to construct a crate (or not enough room to construct a crate).
        // Did we succeed? If so then reset the lastConstructStorageAttemptLoopCounter. Otherwise wait some number of loops and try again.
        if (resource.lastConstructStorageAttemptLoopCounter !== 0 && state.resources.Crates.currentQuantity !== state.lastCratesOwned) {
            log("resource: " + resource.id + " successfully constructed a crate, current crates: " + state.resources.Crates.currentQuantity);

            // Successfully constructed a crate so leave the modal window open and continue
            resource.lastConstructStorageAttemptLoopCounter = 0;
        } else if (resource.lastConstructStorageAttemptLoopCounter !== 0
            && state.loopCounter > resource.lastConstructStorageAttemptLoopCounter && state.loopCounter < resource.lastConstructStorageAttemptLoopCounter + 120) {
                log("resource: " + resource.id + " EITHER we didn't successfully construct a crate, current crates : " + state.resources.Crates.currentQuantity + ", last crates: " + state.lastCratesOwned);
                log("resource: " + resource.id + ", OR awaiting loop, last loop: " + resource.lastConstructStorageAttemptLoopCounter + ", current loop: " + state.loopCounter);

                // Ok, we failed to construct a crate. Close the modal window if it is open and we'll try again in some number of loops
                state.modal.closeModalWindow();
                return true;
        } else {
            // We've waited out our loop timer, let's try again!
            resource.lastConstructStorageAttemptLoopCounter = 0;
        }

        // Open the modal this loop then continue processing next loop to give the modal time to open
        if (!state.modal.isOpen()) {
            log("resource: " + resource.id + " opening options");
            state.modal.openModalWindow();
            resource.openOptions();
            return true;
        }

        // Update our assigned crates and containers again
        resource.updateOptions();
        log("resource: " + resource.id + ", updated crates assigned: " + resource.assignedCrates);
        
        let adjustedLastCratesOwned = state.lastCratesOwned;
        let adjustedCurrentCratesOwned = state.resources.Crates.currentQuantity;
        let adjustedMaxCrates = state.resources.Crates.maxQuantity;

        // If we own some crates and can assign them then lets do that
        let cratesToAssign = Math.min(state.resources.Crates.currentQuantity, nbrCrates - resource.assignedCrates);
        if (cratesToAssign <= 0) {
            cratesToAssign = 0;
        } else {
            // We've successfully got something to assign
            log("resource: " + resource.id + ", cratesToAssign: " + cratesToAssign);
            resource.lastConstructStorageAttemptLoopCounter = 0;
        }

        log("resource: " + resource.id + ", adjustedLastCratesOwned: " + adjustedLastCratesOwned + ", adjustedCurrentCratesOwned: " + adjustedCurrentCratesOwned + ", adjustedMaxCrates: " + adjustedMaxCrates);

        for (let i = 0; i < cratesToAssign; i++) {
            resource.tryAssignCrate();
            resource.assignedCrates++;
        }

        adjustedLastCratesOwned -= cratesToAssign;
        adjustedCurrentCratesOwned -= cratesToAssign;
        adjustedMaxCrates -= cratesToAssign;

        // Now that we've assigned crates and containers we have to do this check again.
        // We already have more crates assigned to this resource than what is being requested
        // so there is nothing to do. Close the modal window. Return true to give the modal window
        // time to close
        if (resource.assignedCrates >= nbrCrates) {
            log("resource: " + resource.id + ", enough crates 3, assigned: " + resource.assignedCrates);
            state.modal.closeModalWindow();
            return true;
        }

        // If we need to build more crates then lets try to do that.
        // Since we don't have access to whether we can build a crate or not we'll have to be a little bit tricky.
        // We'll try and construct a crate then compare the currently owned crates with our last known currently owned crates.
        // If they are different then we successfully constructed a crate!
        // DON'T DO THIS CHECK IF WE HAVEN'T TRIED CONSTRUCTING ANYTHING YET
        state.lastCratesOwned = adjustedCurrentCratesOwned;
        resource.lastConstructStorageAttemptLoopCounter = state.loopCounter;

        // If we have space for more crates then try and construct another crate
        // We'll have to wait until the next loop to see if we succeeded
        if (adjustedCurrentCratesOwned < adjustedMaxCrates) {
            log("resource: " + resource.id + " trying to construct a crate, adjustedCurrentCratesOwned: " + adjustedCurrentCratesOwned + ", adjustedMaxCrates: " + adjustedMaxCrates);

            // This is the last loop that we tried to construct a crate
            resource.tryConstructCrate();
            return true;
        } else {
            log("resource: " + resource.id + " don't have enough room for crates, adjustedCurrentCratesOwned: " + adjustedCurrentCratesOwned + ", adjustedMaxCrates: " + adjustedMaxCrates);

            // We didn't try constructing a crate but not having enough room for crates is basically the same thing so set our last loop counter
            // This is the last loop that we tried to construct a crate
            state.modal.closeModalWindow();
            return true;
        }
    }

    //#endregion Auto Trade Specials
    
    //#region Main Loop

    function updateState() {
        if ($('#evolution') !== null && ($('#evolution')[0].style.display !== 'none') || $('#topBar > span')[0].textContent === "Prehistoric") {
            state.goal = "Evolution";
        } else if (state.goal === "Evolution") {
            state.goal = "Standard";
        }

        // Reset modal window open indicator
        state.modal.openThisLoop = false;

        // If our script opened a modal window but it is now closed (and the script didn't close it) then the user did so don't continue
        // with whatever our script was doing with the open modal window.
        if (state.modal.openedByScript && !state.modal.isOpen()) {
            state.modal.openedByScript = false;
        }

        // This would be better done in the class itself
        if (document.querySelector("#tech-breeder_reactor .oldTech") === null) {
            state.cityBuildings.FissionPower.consumption.power = -14;
        } else {
            state.cityBuildings.FissionPower.consumption.power = -18;
        }
    }

    function automate() {
        updateState();
        updateUI();
        
        if (state.goal === "Evolution") {
            if (settings.autoEvolution) {
                autoEvolution();
            }
        } else if (state.goal !== "GameOverMan") {
            if (settings.autoFight) {
                autoBattle();
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
            if (settings.autoMarket && isMarketUnlocked()) {
                autoMarket();
            }
            if (settings.autoJobs) {
                autoJobs();
            }
            if (settings.autoPower) {
                autoBuildingPriority();
            }
            if (settings.autoTradeSpecialResources) {
                autoTradeSpecialResources();
            }
            if (settings.autoSmelter) {
                autoSmelter();
            }
            if (settings.autoFactory) {
                autoFactory();
            }
            if (settings.autoMAD) {
                autoMAD();
            }
            if (settings.autoSpace) {
                autoSpace();
            }
            if (settings.autoSeeder) {
                autoSeeder();
            }
        }
        
        if (state.loopCounter <= 10000) {
            state.loopCounter++;
        } else {
            state.loopCounter = 1;
        }
    }

    setInterval(automate, 1000);

    //#endregion Main Loop

    //#region UI

    function createSettingToggle(name, enabledCallBack, disabledCallBack) {
        let elm = $('#autoScriptContainer');
        let toggle = $('<label tabindex="0" class="switch" id="'+name+'" style=""><input type="checkbox" value=false> <span class="check"></span><span>'+name+'</span></label></br>');
        elm.append(toggle);
        if (settings[name]) {
            toggle.click();
            toggle.children('input').attr('value', true);
            if (enabledCallBack !== undefined) {
                enabledCallBack();
            }
        }
        toggle.on('mouseup', function(e) {
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

    function updateUI() {
        if ($('#autoScriptContainer').length === 0) {
            let autoScriptContainer = $('<div id="autoScriptContainer"></div>');
            $('#resources').append(autoScriptContainer);
        }
        
        let autoScriptContainerNode = document.querySelector('#autoScriptContainer');
        if (autoScriptContainerNode.nextSibling !== null) {
            autoScriptContainerNode.parentNode.appendChild(autoScriptContainerNode);
        }
        
        if ($('#autoEvolution').length === 0) {
            createSettingToggle('autoEvolution');
        }
        if ($('#autoFight').length === 0) {
            createSettingToggle('autoFight');
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
        if ($('#autoMarket').length === 0 && isMarketUnlocked()) {
            createSettingToggle('autoMarket', createMarketToggles, removeMarketToggles);
        } else if (settings.autoMarket > 0 && $('.ea-market-toggle').length === 0 && isMarketUnlocked()) {
            createMarketToggles()
        }
        if ($('#autoResearch').length === 0) {
            createSettingToggle('autoResearch');
        }
        if ($('#autoARPA').length === 0) {
            createSettingToggle('autoARPA', createArpaToggles, removeArpaToggles);
        } else if (settings.autoArpa && $('.ea-arpa-toggle').length === 0) {
            createArpaToggles();
        }
        if ($('#autoJobs').length === 0) {
            createSettingToggle('autoJobs');
        }
        if ($('#autoPower').length === 0) {
            createSettingToggle('autoPower');
        }
        if ($('#autoTradeSpecialResources').length === 0) {
            createSettingToggle('autoTradeSpecialResources');
        }
        if ($('#autoSmelter').length === 0) {
            createSettingToggle('autoSmelter');
        }
        if ($('#autoFactory').length === 0) {
            createSettingToggle('autoFactory');
        }
        if ($('#autoMAD').length === 0) {
            createSettingToggle('autoMAD');
        }
        if ($('#autoSpace').length === 0) {
            createSettingToggle('autoSpace');
        }
        if ($('#autoSeeder').length === 0) {
            createSettingToggle('autoSeeder');
        }
//        if ($('#autoLogging').length === 0) {
//            createSettingToggle('autoLogging');
//        }
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
            minMoneyInput.val(settings.minimumMoney);
            let setBtn = $('<a class="button is-dark is-small" id="set-min-money"><span>set</span></a>');
            settingsDiv.append(minMoneyTxt).append(minMoneyInput).append(setBtn);
            $('#autoScriptContainer').append(settingsDiv);

            setBtn.on('mouseup', function() {
                let val = minMoneyInput.val();
                let minMoney = getRealNumber(val);
                if (!isNaN(minMoney)) {
                    console.log('setting minimum money to : '+minMoney);
                    settings.minimumMoney = minMoney;
                    updateSettingsFromState();
                }
            });
        }
    }

    /**
     * @param {string} name
     */
    function createArpaToggle(name) {
        let arpaDiv = $('#arpa' + name + ' .head');
        let toggle = $('<label tabindex="0" class="switch ea-arpa-toggle" style="position:relative; max-width:75px;margin-top: -36px;left:45%;float:left;"><input type="checkbox" value=false> <span class="check" style="height:5px;"></span></label>');
        arpaDiv.append(toggle);
        if (settings.arpa[name]) {
            toggle.click();
            toggle.children('input').attr('value', true);
        }
        toggle.on('mouseup', function(e) {
            let input = e.currentTarget.children[0];
            let state = !(input.getAttribute('value') === "true");
            input.setAttribute('value', state);
            settings.arpa[name] = state;
            updateSettingsFromState();
        });
    }

    function createArpaToggles() {
        removeArpaToggles();
        createArpaToggle('lhc');
        createArpaToggle('stock_exchange');
        createArpaToggle('monument');
        
        if (document.querySelector('#arpalaunch_facility') !== null) {
            createArpaToggle('launch_facility');
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
        let toggle = $('<label tabindex="0" class="switch ea-craft-toggle" style="position:absolute; max-width:75px;margin-top: 4px;left:8%;"><input type="checkbox" value=false> <span class="check" style="height:5px;"></span></label>');
        resourceSpan.append(toggle);
        if (craftable.autoCraftEnabled) {
            toggle.click();
            toggle.children('input').attr('value', true);
        }
        toggle.on('mouseup', function(e) {
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
        let buildingElement = $('#' + building._tabPrefix + '-' + building.id);
        let toggle = $('<label tabindex="0" class="switch ea-building-toggle" style="position:absolute; margin-top: 30px;left:8%;"><input type="checkbox" value=false> <span class="check" style="height:5px; max-width:15px"></span></label>');
        buildingElement.append(toggle);
        if (building.autoBuildEnabled) {
            toggle.click();
            toggle.children('input').attr('value', true);
        }
        toggle.on('mouseup', function(e) {
            let input = e.currentTarget.children[0];
            let state = !(input.getAttribute('value') === "true");
            input.setAttribute('value', state);
            building.autoBuildEnabled = state;
            updateSettingsFromState();
        });
    }
    
    function createBuildingToggles() {
        removeBuildingToggles();
        
        for (let i = 0; i < state.allBuildingList.length; i++) {
            createBuildingToggle(state.allBuildingList[i]);
        }
    }
    
    function removeBuildingToggles() {
        $('.ea-building-toggle').remove();
    }

    /**
     * @param {Resource} resource
     */
    function createMarketToggle(resource) {
        let marketRow = $('#market-' + resource.id);
        let toggleBuy = $('<label tabindex="0" class="switch ea-market-toggle" style=""><input type="checkbox" value=false> <span class="check" style="height:5px;"></span><span class="control-label" style="font-size: small;">auto buy (&lt' + resource.buyRatio + ')</span><span class="state"></span></label>');
        let toggleSell = $('<label tabindex="0" class="switch ea-market-toggle" style=""><input type="checkbox" value=false> <span class="check" style="height:5px;"></span><span class="control-label" style="font-size: small;">auto sell (&gt' + resource.sellRatio + ')</span><span class="state"></span></label>');
        marketRow.append(toggleBuy);
        marketRow.append(toggleSell);
        if (resource.autoBuyEnabled) {
            toggleBuy.click();
            toggleBuy.children('input').attr('value', true);
        }
        if (resource.autoSellEnabled) {
            toggleSell.click();
            toggleSell.children('input').attr('value', true);
        }
        toggleBuy.on('mouseup', function(e) {
            console.log(e);
            let input = e.currentTarget.children[0];
            let state = !(input.getAttribute('value') === "true");
            input.setAttribute('value', state);
            resource.autoBuyEnabled = state;
            let otherState = toggleSell.children('input').attr('value') === 'true';
            if (state && otherState) {
                toggleSell.click();
                toggleSell.trigger('mouseup');
            }
            updateSettingsFromState();
            console.log(state);
        });
        toggleSell.on('mouseup', function(e) {
            console.log(e);
            let input = e.currentTarget.children[0];
            let state = !(input.getAttribute('value') === "true");
            input.setAttribute('value', state);
            resource.autoSellEnabled = state;
            let otherState = toggleBuy.children('input').attr('value') === 'true';
            if (state && otherState) {
                toggleBuy.click();
                toggleBuy.trigger('mouseup');
            }
            updateSettingsFromState();
            console.log(state);
        });
    }

    function createMarketToggles() {
        removeMarketToggles();
        for (let i = 0; i < state.tradableResourceList.length; i++) {
            createMarketToggle(state.tradableResourceList[i]);
        }
    }

    function removeMarketToggles() {
        $('.ea-market-toggle').remove();
    }

    //#endregion UI

    //#region Utility Functions

    var numberSuffix = {
        K: 1000,
        M: 1000000,
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
     * @param {number} buyValue
     * @return {boolean}
     */
    function wouldBreakMoneyFloor(buyValue) {
        return state.resources.Money.currentQuantity - buyValue < settings.minimumMoney;
    }
    
    /**
     * @return {string}
     */
    function getRaceName() {
        let raceNameNode = document.querySelector('#race .column > span');
        if (raceNameNode === null) {
            return "";
        }
        
        return raceNameNode.textContent;
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

    /**
     * @param {string} text
     */
    function log(text) {
        if (settings.autoLogging) {
            console.log(text);
        }
    }

    //#endregion Utility Functions

// @ts-ignore
})($);
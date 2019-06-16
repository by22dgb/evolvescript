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
    if (jsonSettings != null) {
        settings = JSON.parse(jsonSettings);
    }

    //#region Class Declarations

    class Action {
        /**
         * @param {Document} document
         * @param {string} tabPrefix
         * @param {string} id
         * @param {boolean} isBuilding
         */
        constructor(document, tabPrefix, id, isBuilding) {
            this._document = document;
            this._tabPrefix = tabPrefix;
            this._id = id;
            this._isBuilding = isBuilding;
            this.autoBuildEnabled = true;

            this.stateOn = {
                powerInput: 0,
                powerOutput: 0,
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
            return document.getElementById(this._tabPrefix + "-" + this.id) != null;
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

            let containerNode = document.getElementById(this._tabPrefix + "-" + this.id);
            
            if (containerNode.classList.contains("cna")) { return false; }
            if (containerNode.classList.contains("cnam")) { return false; }
            
            return true;
        }
        
        // This is a "safe" click. It will only click if the container is currently clickable.
        // ie. it won't bypass the interface and click the node if it isn't clickable in the UI.
        click() {
            if (!this.isClickable()) {
                return false
            }
            
            let containerNode = document.getElementById(this._tabPrefix + "-" + this.id);
            let mainClickNode = containerNode.getElementsByTagName("a")[0];
            
            // Click it real good
            if (mainClickNode != null) {
                mainClickNode.click();
                return true;
            }
            
            return false;
        }

        //#endregion Standard actions

        //#region Buildings

        hasCount() {
            if (!this.isUnlocked()) {
                return false;
            }

            let containerNode = document.getElementById(this._tabPrefix + "-" + this.id);
            return containerNode.querySelector(' .button .count') != null;
        }
        
        get count() {
            if (!this.hasCount()) {
                return 0;
            }

            let containerNode = document.getElementById(this._tabPrefix + "-" + this.id);
            return parseInt(containerNode.querySelector(' .button .count').textContent);
        }
        
        hasState() {
            if (!this.isUnlocked()) {
                return false;
            }

            // If there is an "on" state count node then there is state
            let containerNode = document.getElementById(this._tabPrefix + "-" + this.id);
            return containerNode.querySelector(' .on') != null;
        }
        
        get stateOnCount() {
            if (!this.hasState()) {
                return 0;
            }
            
            let containerNode = document.getElementById(this._tabPrefix + "-" + this.id);
            return parseInt(containerNode.querySelector(' .on').textContent);
        }
        
        get stateOffCount() {
            if (!this.hasState()) {
                return 0;
            }
            
            let containerNode = document.getElementById(this._tabPrefix + "-" + this.id);
            return parseInt(containerNode.querySelector(' .off').textContent);
        }
        
        // Make the click a little more meaningful for a building
        tryBuild() {
            return this.click();
        }
        
        trySetStateOn() {
            if (!this.hasState()) {
                return false;
            }
            
            let containerNode = document.getElementById(this._tabPrefix + "-" + this.id);
            // @ts-ignore
            containerNode.querySelector(' .on').click();
        }
        
        trySetStateOff() {
            if (!this.hasState()) {
                return false;
            }
            
            let containerNode = document.getElementById(this._tabPrefix + "-" + this.id);
            // @ts-ignore
            containerNode.querySelector(' .off').click();
        }

        //#endregion Buildings
    }

    class Resource {
        /**
         * @param {Document} document
         * @param {string} prefix
         * @param {string} id
         * @param {boolean} isTradable
         * @param {number} buyRatio
         * @param {number} sellRatio
         * @param {boolean} isCraftable
         * @param {number} craftRatio
         */
        constructor(document, prefix, id, isTradable, buyRatio, sellRatio, isCraftable, craftRatio) {
            this._document = document;
            this._prefix = prefix;
            this._id = id;
            this._isPopulation = (id == "Population");
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

            /** @type {Action[]} */
            this.usedInBuildings = [];

            /** @type {Resource[]} */
            this.requiredResourcesToAction = [];
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
            return containerNode != null && containerNode.style.display != "none";
        }

        hasOptions() {
            // Options is currently the + button for accessing crates and containers
            if (!this.isUnlocked()) {
                return false;
            }

            return document.getElementById("con" + this.id) != null;
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

            if (storageNode != null) {
                // 2 possibilities:
                // eg. "3124.16" the current quasntity is 3124.16
                // eg. in "1234 / 10.2K" the current quantity is 1234
                if (storageNode.textContent.indexOf("/") == -1) {
                    return getRealNumber(storageNode.textContent);
                }

                return getRealNumber(storageNode.textContent.split(" / ")[0]);
            }

            // If storage node is null then it might be plasmids which doesn't have the id...
            let countNode = document.querySelector("#" + this._prefix + this.id + " .count");
            if (countNode != null) {
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
            // eg. "3124.16" the current quasntity is 3124.16
            // eg. in "1234 / 10.2K" the current quantity is 1234
            if (storageNode == null || storageNode.textContent.indexOf("/") == -1) {
                return Number.MAX_SAFE_INTEGER;
            }

            // eg. in "1234 / 10.2K" the max quantity is 10.2K
            return getRealNumber(storageNode.textContent.split(" / ")[1]);
        }
        
        get storageRatio() {
            // If "326 / 1204" then storage ratio would be 0.27 (ie. storage is 27% full)
            let max = this.maxQuantity;

            if (this.maxQuantity == 0) {
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

            let optionsTitleNode = document.getElementById("modalBoxTitle");
            if (optionsTitleNode === null) {
                return false;
            }

            // We want to compare if the first part of the modal window title matches the id of this resource
            // eg. "Iridium - 26.4K/279.9K"
            return (optionsTitleNode.textContent.substring(0, optionsTitleNode.textContent.indexOf(" ")) == this.id);
        }
        
        openOptions() {
            if (!this.hasOptions()) {
                return;
            }
            
            let optionsNode = document.getElementById("con" + this.id);
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
            if (assignedCratesNode != null) {
                this.assignedCrates = parseInt(assignedCratesNode.textContent.substring(17));
            } else {
                this.assignedCrates = 0;
            }

            // eg. "Containers Assigned: 0"
            let assignedContainersNode = document.querySelector('#modalContainers .crateHead > span:nth-child(2)');
            this.isAssignedContainersUpdated = true;
            if (assignedContainersNode != null) {
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
                if (crateButtons[i].textContent == "Construct Crate") {
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
                if (crateButtons[i].textContent == "Assign Crate") {
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
                if (crateButtons[i].textContent == "Unassign Crate") {
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
                if (containerButtons[i].textContent == "Construct Container") {
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
                if (containerButtons[i].textContent == "Assign Container") {
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
                if (containerButtons[i].textContent == "Unassign Container") {
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

            if (craftClickNode != null) {
                craftClickNode.click();
                return true;
            }
            
            return false;
        }

        //#endregion Craftable resource
    }

    class ModalWindowManager {
        /**
         * @param {Document} document
         */
        constructor(document) {
            this._document = document;
            this.openThisLoop = false;
        }

        get currentModalWindowTitle() {
            let modalTitleNode = document.getElementById("modalBoxTitle");
            if (modalTitleNode === null) {
                return "";
            }

            // Modal title will either be a single name or a combination of resource and storage 
            // eg. single name "Smelter" or "Factory"
            // eg. combination "Iridium - 26.4K/279.9K"
            let indexOfSpace = modalTitleNode.textContent.indexOf(" ");
            if (indexOfSpace == -1) {
                return modalTitleNode.textContent;
            } else {
                return modalTitleNode.textContent.substring(0, indexOfSpace);
            }
        }

        openModalWindow() {
            this.openThisLoop = true;
        }

        isOpen() {
            // We want to give the modal time to close so if there was a modal open this loop then just say there is a modal open
            let isOpen = document.getElementById("modalBox") != null;
            if (isOpen) {
                this.openThisLoop = true;
            }

            return isOpen || this.openThisLoop;
        }

        closeModalWindow() {
            let modalCloseBtn = document.querySelector('.modal > .modal-close');
            if (modalCloseBtn != null) {
                // @ts-ignore
                modalCloseBtn.click();
            }
        }
    }
    
    //#endregion Class Declarations

    //#region State and Initialisation

    var state = {
        loopCounter: 1,

        modal: new ModalWindowManager(document),
        
        lastGenomeSequenceValue: 0,
        lastSmelterCount: 0,
        lastSmelterOpenedRateOfChange: 0,
        lastFactoryCount: 0,
        
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
            Money: new Resource(document, "res", "Money", false, -1, -1, false, -1),
            Population: new Resource(document, "res", "Population", false, -1, -1, false, -1), // The population node is special and its id will change to the race name
            Knowledge: new Resource(document, "res", "Knowledge", false, -1, -1, false, -1),
            Crates: new Resource(document, "res", "Crates", false, -1, -1, false, -1),
            Containers: new Resource(document, "res", "Containers", false, -1, -1, false, -1),
            Plasmids: new Resource(document, "res", "Plasmid", false, -1, -1, false, -1),

            // Basic resources
            Food: new Resource(document, "res", "Food", true, 0.5, 0.9, false, -1),
            Lumber: new Resource(document, "res", "Lumber", true, 0.5, 0.9, false, -1),
            Stone: new Resource(document, "res", "Stone", true, 0.5, 0.9, false, -1),
            Furs: new Resource(document, "res", "Furs", true, 0.5, 0.9, false, -1),
            Copper: new Resource(document, "res", "Copper", true, 0.5, 0.9, false, -1),
            Iron: new Resource(document, "res", "Iron", true, 0.5, 0.9, false, -1),
            Cement: new Resource(document, "res", "Cement", true, 0.3, 0.9, false, -1),
            Coal: new Resource(document, "res", "Coal", true, 0.5, 0.9, false, -1),
            Oil: new Resource(document, "res", "Oil", true, 0.5, 0.9, false, -1),
            Uranium: new Resource(document, "res", "Uranium", true, 0.5, 0.9, false, -1),
            Steel: new Resource(document, "res", "Steel", true, 0.5, 0.9, false, -1),
            Titanium: new Resource(document, "res", "Titanium", true, 0.8, 0.9, false, -1),
            Alloy: new Resource(document, "res", "Alloy", true, 0.8, 0.9, false, -1),
            Polymer: new Resource(document, "res", "Polymer", true, 0.8, 0.9, false, -1),
            Iridium: new Resource(document, "res", "Iridium", true, 0.8, 0.9, false, -1),
            Helium_3: new Resource(document, "res", "Helium_3", true, 0.8, 0.9, false, -1),
            
            // Craftable resources
            Plywood: new Resource(document, "res", "Plywood", false, -1, -1, true, 0.5),
            Brick: new Resource(document, "res", "Brick", false, -1, -1, true, 0.5),
            WroughtIron: new Resource(document, "res", "Wrought_Iron", false, -1, -1, true, 0.5),
            SheetMetal: new Resource(document, "res", "Sheet_Metal", false, -1, -1, true, 0.5),
            Mythril: new Resource(document, "res", "Mythril", false, -1, -1, true, 0.5),
        },
        
        /** @type {Action[]} */
        evolutionList: [],
        evolutions: {
            Rna: new Action(document, "evo", "rna", false),
            Dna: new Action(document, "evo", "dna", false),

            Sentience: new Action(document, "evo", "sentience", false),
            //Ectothermic: new Action(document, "evo", "ectothermic", false),
            //Eggshell: new Action(document, "evo", "eggshell", false),
            Arthropods: new Action(document, "evo", "athropods", false),
            BilateralSymmetry: new Action(document, "evo", "bilateral_symmetry", false),
            Multicellular: new Action(document, "evo", "multicellular", false),
            Phagocytosis: new Action(document, "evo", "phagocytosis", false),
            SexualReproduction: new Action(document, "evo", "sexual_reproduction", false),
            
            Membrane: new Action(document, "evo", "membrane", true),
            Organelles: new Action(document, "evo", "organelles", true),
            Nucleus: new Action(document, "evo", "nucleus", true),
            EukaryoticCell: new Action(document, "evo", "eukaryotic_cell", true),
            Mitochondria: new Action(document, "evo", "mitochondria", true),
        },

        /** @type {Action[]} */
        allBuildingList: [],
        
        /** @type {Action[]} */
        cityBuildingList: [],
        cityBuildings: {
            Food: new Action(document, "city", "food", false),
            Lumber: new Action(document, "city", "lumber", false),
            Stone: new Action(document, "city", "stone", false),

            University: new Action(document, "city", "university", true),
            Wardenclyffe: new Action(document, "city", "wardenclyffe", true),
            Mine: new Action(document, "city", "mine", true),
            CoalMine: new Action(document, "city", "coal_mine", true),
            Smelter: new Action(document, "city", "smelter", true),
            CoalPower: new Action(document, "city", "coal_power", true),
            Temple: new Action(document, "city", "temple", true),
            OilWell: new Action(document, "city", "oil_well", true),
            BioLab: new Action(document, "city", "biolab", true),
            StorageYard: new Action(document, "city", "storage_yard", true),
            Warehouse: new Action(document, "city", "warehouse", true),
            OilPower: new Action(document, "city", "oil_power", true),
            Bank: new Action(document, "city", "bank", true),
            Garrison: new Action(document, "city", "garrison", true),
            House: new Action(document, "city", "house", true),
            Cottage: new Action(document, "city", "cottage", true),
            Apartment: new Action(document, "city", "apartment", true),
            Farm: new Action(document, "city", "farm", true),
            Mill: new Action(document, "city", "mill", true),
            Silo: new Action(document, "city", "silo", true),
            Shed: new Action(document, "city", "shed", true),
            LumberYard: new Action(document, "city", "lumber_yard", true),
            RockQuarry: new Action(document, "city", "rock_quarry", true),
            CementPlant: new Action(document, "city", "cement_plant", true),
            Foundry: new Action(document, "city", "foundry", true),
            Factory: new Action(document, "city", "factory", true),
            OilDepot: new Action(document, "city", "oil_depot", true),
            Trade: new Action(document, "city", "trade", true),
            Amphitheatre: new Action(document, "city", "amphitheatre", true),
            Library: new Action(document, "city", "library", true),
            Sawmill: new Action(document, "city", "sawmill", true),
            FissionPower: new Action(document, "city", "fission_power", true),
            Lodge: new Action(document, "city", "lodge", true),
            Smokehouse: new Action(document, "city", "smokehouse", true),
            Casino: new Action(document, "city", "casino", true),
            TouristCenter: new Action(document, "city", "tourist_center", true),
            MassDriver: new Action(document, "city", "mass_driver", true),
            Wharf: new Action(document, "city", "wharf", true),
        },
        
        /** @type {Action[]} */
        spaceBuildingList: [],
        spaceBuildings: {
            // Space
            test_launch: new Action(document, "space", "test_launch", true),
            satellite: new Action(document, "space", "satellite", true),
            gps: new Action(document, "space", "gps", true),
            propellant_depot: new Action(document, "space", "propellant_depot", true),
            nav_beacon: new Action(document, "space", "nav_beacon", true),
            
            // Moon
            moon_mission: new Action(document, "space", "moon_mission", true),
            moon_base: new Action(document, "space", "moon_base", true),
            iridium_mine: new Action(document, "space", "iridium_mine", true),
            helium_mine: new Action(document, "space", "helium_mine", true),
            observatory: new Action(document, "space", "observatory", true),
            
            // Red
            red_mission: new Action(document, "space", "red_mission", true),
            spaceport: new Action(document, "space", "spaceport", true),
            red_tower: new Action(document, "space", "red_tower", true),
            living_quarters: new Action(document, "space", "living_quarters", true),
            garage: new Action(document, "space", "garage", true),
            red_mine: new Action(document, "space", "red_mine", true),
            fabrication: new Action(document, "space", "fabrication", true),
            red_factory: new Action(document, "space", "red_factory", true),
            biodome: new Action(document, "space", "biodome", true),
            exotic_lab: new Action(document, "space", "exotic_lab", true),
            space_barracks: new Action(document, "space", "space_barracks", true),
            
            // Hell
            hell_mission: new Action(document, "space", "hell_mission", true),
            geothermal: new Action(document, "space", "geothermal", true),
            swarm_plant: new Action(document, "space", "swarm_plant", true),
            
            // Sun
            sun_mission: new Action(document, "space", "sun_mission", true),
            swarm_control: new Action(document, "space", "swarm_control", true),
            swarm_satellite: new Action(document, "space", "swarm_satellite", true),
            
            // Gas
            gas_mission: new Action(document, "space", "gas_mission", true),
            gas_mining: new Action(document, "space", "gas_mining", true),
            gas_storage: new Action(document, "space", "gas_storage", true),
            
            // Gas moon
            gas_moon_mission: new Action(document, "space", "gas_moon_mission", true),
            outpost: new Action(document, "space", "outpost", true),
            oil_extractor: new Action(document, "space", "oil_extractor", true),
            
            // Belt
            belt_mission: new Action(document, "space", "belt_mission", true),
            space_station: new Action(document, "space", "space_station", true),
            elerium_ship: new Action(document, "space", "elerium_ship", true),
            iridium_ship: new Action(document, "space", "iridium_ship", true),
            iron_ship: new Action(document, "space", "iron_ship", true),
            
            // Dwarf
            dwarf_mission: new Action(document, "space", "dwarf_mission", true),
            elerium_contain: new Action(document, "space", "elerium_contain", true),
            e_reactor: new Action(document, "space", "e_reactor", true),
        },
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
        
        // Construct evolution phase list
        state.evolutionList.push(state.evolutions.Rna);
        state.evolutionList.push(state.evolutions.Dna);
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
        state.cityBuildings.University.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.University.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Wardenclyffe);
        state.cityBuildings.Wardenclyffe.requiredResourcesToAction.push(state.resources.Copper);
        state.cityBuildings.Wardenclyffe.requiredResourcesToAction.push(state.resources.Cement);
        state.cityBuildings.Wardenclyffe.requiredResourcesToAction.push(state.resources.SheetMetal);
        state.cityBuildings.Wardenclyffe.stateOn.powerInput = 2;
        state.cityBuildingList.push(state.cityBuildings.Mine);
        state.cityBuildings.Mine.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.Mine.stateOn.powerInput = 1;
        state.cityBuildingList.push(state.cityBuildings.CoalMine);
        state.cityBuildings.CoalMine.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.CoalMine.requiredResourcesToAction.push(state.resources.WroughtIron);
        state.cityBuildings.CoalMine.stateOn.powerInput = 1;
        state.cityBuildingList.push(state.cityBuildings.Smelter);
        state.cityBuildings.Smelter.requiredResourcesToAction.push(state.resources.Iron);
        state.cityBuildingList.push(state.cityBuildings.CoalPower);
        state.cityBuildings.CoalPower.requiredResourcesToAction.push(state.resources.Copper);
        state.cityBuildings.CoalPower.requiredResourcesToAction.push(state.resources.Cement);
        state.cityBuildings.CoalPower.requiredResourcesToAction.push(state.resources.Steel);
        state.cityBuildings.CoalPower.stateOn.powerOutput = 5;
        state.cityBuildingList.push(state.cityBuildings.Temple);
        state.cityBuildings.Temple.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.Temple.requiredResourcesToAction.push(state.resources.Furs);
        state.cityBuildings.Temple.requiredResourcesToAction.push(state.resources.Cement);
        state.cityBuildingList.push(state.cityBuildings.OilWell);
        state.cityBuildings.OilWell.requiredResourcesToAction.push(state.resources.Cement);
        state.cityBuildings.OilWell.requiredResourcesToAction.push(state.resources.Steel);
        state.cityBuildingList.push(state.cityBuildings.BioLab);
        state.cityBuildings.BioLab.requiredResourcesToAction.push(state.resources.Copper);
        state.cityBuildings.BioLab.requiredResourcesToAction.push(state.resources.Alloy);
        state.cityBuildings.BioLab.stateOn.powerInput = 2;
        state.cityBuildingList.push(state.cityBuildings.StorageYard);
        state.cityBuildings.StorageYard.requiredResourcesToAction.push(state.resources.Brick);
        state.cityBuildings.StorageYard.requiredResourcesToAction.push(state.resources.WroughtIron);
        state.cityBuildingList.push(state.cityBuildings.Warehouse); // Is this one special? Will have to think about how to do this one
        state.cityBuildings.Warehouse.requiredResourcesToAction.push(state.resources.Iron);
        state.cityBuildings.Warehouse.requiredResourcesToAction.push(state.resources.Cement);
        state.cityBuildingList.push(state.cityBuildings.OilPower);
        state.cityBuildings.OilPower.requiredResourcesToAction.push(state.resources.Copper);
        state.cityBuildings.OilPower.requiredResourcesToAction.push(state.resources.Cement);
        state.cityBuildings.OilPower.requiredResourcesToAction.push(state.resources.Steel);
        state.cityBuildings.OilPower.stateOn.powerOutput = 6;
        state.cityBuildingList.push(state.cityBuildings.Bank);
        state.cityBuildings.Bank.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.Bank.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Garrison);
        state.cityBuildings.Garrison.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.House);
        state.cityBuildings.House.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildingList.push(state.cityBuildings.Cottage);
        state.cityBuildings.Cottage.requiredResourcesToAction.push(state.resources.Plywood);
        state.cityBuildings.Cottage.requiredResourcesToAction.push(state.resources.Brick);
        state.cityBuildings.Cottage.requiredResourcesToAction.push(state.resources.WroughtIron);
        state.cityBuildingList.push(state.cityBuildings.Apartment);
        state.cityBuildings.Apartment.requiredResourcesToAction.push(state.resources.Furs);
        state.cityBuildings.Apartment.requiredResourcesToAction.push(state.resources.Copper);
        state.cityBuildings.Apartment.requiredResourcesToAction.push(state.resources.Cement);
        state.cityBuildings.Apartment.requiredResourcesToAction.push(state.resources.Steel);
        state.cityBuildings.Apartment.stateOn.powerInput = 1;
        state.cityBuildingList.push(state.cityBuildings.Farm);
        state.cityBuildings.Farm.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.Farm.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Mill);
        state.cityBuildings.Mill.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.Mill.requiredResourcesToAction.push(state.resources.Iron);
        state.cityBuildings.Mill.requiredResourcesToAction.push(state.resources.Cement);
        state.cityBuildings.Mill.stateOn.powerOutput = 1;
        state.cityBuildingList.push(state.cityBuildings.Silo);
        state.cityBuildings.Silo.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.Silo.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Shed); // Is this one special? Will have to think about how to do this one
        state.cityBuildings.Shed.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.Shed.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.LumberYard);
        state.cityBuildings.LumberYard.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.LumberYard.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.RockQuarry);
        state.cityBuildings.RockQuarry.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.RockQuarry.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.CementPlant);
        state.cityBuildings.CementPlant.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.CementPlant.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildings.CementPlant.stateOn.powerInput = 2;
        state.cityBuildingList.push(state.cityBuildings.Foundry);
        state.cityBuildings.Foundry.requiredResourcesToAction.push(state.resources.Copper);
        state.cityBuildings.Foundry.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Factory);
        state.cityBuildings.Factory.requiredResourcesToAction.push(state.resources.Cement);
        state.cityBuildings.Factory.requiredResourcesToAction.push(state.resources.Steel);
        state.cityBuildings.Factory.requiredResourcesToAction.push(state.resources.Titanium);
        state.cityBuildings.Factory.stateOn.powerInput = 3;
        state.cityBuildingList.push(state.cityBuildings.OilDepot);
        state.cityBuildings.OilDepot.requiredResourcesToAction.push(state.resources.Cement);
        state.cityBuildings.OilDepot.requiredResourcesToAction.push(state.resources.SheetMetal);
        state.cityBuildingList.push(state.cityBuildings.Trade);
        state.cityBuildings.Trade.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.Trade.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildings.Trade.requiredResourcesToAction.push(state.resources.Furs);
        state.cityBuildingList.push(state.cityBuildings.Amphitheatre);
        state.cityBuildings.Amphitheatre.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.Amphitheatre.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Library);
        state.cityBuildings.Library.requiredResourcesToAction.push(state.resources.Furs);
        state.cityBuildings.Library.requiredResourcesToAction.push(state.resources.Plywood);
        state.cityBuildings.Library.requiredResourcesToAction.push(state.resources.Brick);
        state.cityBuildingList.push(state.cityBuildings.Sawmill);
        state.cityBuildings.Sawmill.requiredResourcesToAction.push(state.resources.Iron);
        state.cityBuildings.Sawmill.requiredResourcesToAction.push(state.resources.Cement);
        state.cityBuildings.Sawmill.stateOn.powerInput = 1;
        state.cityBuildingList.push(state.cityBuildings.FissionPower);
        state.cityBuildings.FissionPower.requiredResourcesToAction.push(state.resources.Copper);
        state.cityBuildings.FissionPower.requiredResourcesToAction.push(state.resources.Cement);
        state.cityBuildings.FissionPower.requiredResourcesToAction.push(state.resources.Titanium);
        state.cityBuildings.FissionPower.stateOn.powerOutput = 14;
        state.cityBuildingList.push(state.cityBuildings.Lodge); // Cath only
        state.cityBuildings.Lodge.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.Lodge.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Smokehouse); // Cath only
        state.cityBuildings.Smokehouse.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.Smokehouse.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildingList.push(state.cityBuildings.Casino);
        state.cityBuildings.Casino.requiredResourcesToAction.push(state.resources.Furs);
        state.cityBuildings.Casino.requiredResourcesToAction.push(state.resources.Plywood);
        state.cityBuildings.Casino.requiredResourcesToAction.push(state.resources.Brick);
        state.cityBuildingList.push(state.cityBuildings.TouristCenter);
        state.cityBuildings.TouristCenter.requiredResourcesToAction.push(state.resources.Stone);
        state.cityBuildings.TouristCenter.requiredResourcesToAction.push(state.resources.Furs);
        state.cityBuildings.TouristCenter.requiredResourcesToAction.push(state.resources.Plywood);
        state.cityBuildingList.push(state.cityBuildings.MassDriver);
        state.cityBuildings.MassDriver.requiredResourcesToAction.push(state.resources.Copper);
        state.cityBuildings.MassDriver.requiredResourcesToAction.push(state.resources.Iron);
        state.cityBuildings.MassDriver.requiredResourcesToAction.push(state.resources.Iridium);
        state.cityBuildings.MassDriver.stateOn.powerInput = 5;
        state.cityBuildingList.push(state.cityBuildings.Wharf);
        state.cityBuildings.Wharf.requiredResourcesToAction.push(state.resources.Lumber);
        state.cityBuildings.Wharf.requiredResourcesToAction.push(state.resources.Cement);
        state.cityBuildings.Wharf.requiredResourcesToAction.push(state.resources.Oil);

        // Construct space buildsings list
        // TODO: Space! resource requirements, power on state (eg. -25 food) and planet "support"
        state.spaceBuildingList.push(state.spaceBuildings.test_launch);
        state.spaceBuildingList.push(state.spaceBuildings.satellite);
        state.spaceBuildingList.push(state.spaceBuildings.gps);
        state.spaceBuildingList.push(state.spaceBuildings.propellant_depot);
        state.spaceBuildingList.push(state.spaceBuildings.nav_beacon);
        state.spaceBuildings.nav_beacon.stateOn.powerInput = 2;
        state.spaceBuildingList.push(state.spaceBuildings.moon_mission);
        state.spaceBuildingList.push(state.spaceBuildings.moon_base); // this building resets ui when clicked
        state.spaceBuildings.moon_base.stateOn.powerInput = 4;
        state.spaceBuildingList.push(state.spaceBuildings.iridium_mine);
        state.spaceBuildingList.push(state.spaceBuildings.helium_mine);
        state.spaceBuildingList.push(state.spaceBuildings.observatory);
        state.spaceBuildingList.push(state.spaceBuildings.red_mission);
        
        state.spaceBuildingList.push(state.spaceBuildings.spaceport); // this building resets ui when clicked
        state.spaceBuildings.spaceport.stateOn.powerInput = 5;
        state.spaceBuildingList.push(state.spaceBuildings.red_tower);
        state.spaceBuildingList.push(state.spaceBuildings.living_quarters);
        state.spaceBuildingList.push(state.spaceBuildings.garage);
        state.spaceBuildingList.push(state.spaceBuildings.red_mine);
        state.spaceBuildingList.push(state.spaceBuildings.fabrication);
        state.spaceBuildingList.push(state.spaceBuildings.red_factory);
        state.spaceBuildingList.push(state.spaceBuildings.biodome);
        
        state.spaceBuildingList.push(state.spaceBuildings.exotic_lab); // this building resets ui when clicked
        state.spaceBuildingList.push(state.spaceBuildings.space_barracks);
        state.spaceBuildingList.push(state.spaceBuildings.hell_mission);
        state.spaceBuildingList.push(state.spaceBuildings.geothermal);
        state.spaceBuildingList.push(state.spaceBuildings.swarm_plant);
        state.spaceBuildingList.push(state.spaceBuildings.sun_mission);
        state.spaceBuildingList.push(state.spaceBuildings.swarm_control);
        state.spaceBuildingList.push(state.spaceBuildings.swarm_satellite);
        state.spaceBuildingList.push(state.spaceBuildings.gas_mission);
        state.spaceBuildingList.push(state.spaceBuildings.gas_mining);
        state.spaceBuildingList.push(state.spaceBuildings.gas_storage);
        
        state.spaceBuildingList.push(state.spaceBuildings.gas_moon_mission);
        state.spaceBuildingList.push(state.spaceBuildings.outpost);
        state.spaceBuildingList.push(state.spaceBuildings.oil_extractor);
        state.spaceBuildingList.push(state.spaceBuildings.belt_mission);
        state.spaceBuildingList.push(state.spaceBuildings.space_station); // this building resets ui when clicked
        state.spaceBuildingList.push(state.spaceBuildings.elerium_ship);
        state.spaceBuildingList.push(state.spaceBuildings.iridium_ship);
        state.spaceBuildingList.push(state.spaceBuildings.iron_ship);
        state.spaceBuildingList.push(state.spaceBuildings.dwarf_mission);
        state.spaceBuildingList.push(state.spaceBuildings.elerium_contain);
        state.spaceBuildingList.push(state.spaceBuildings.e_reactor);
        
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
            settings.autoEvolution = true;
        }
        if (!settings.hasOwnProperty('autoMarket')) {
            settings.autoMarket = true;
        }
        if (!settings.hasOwnProperty('autoFight')) {
            settings.autoFight = true;
        }
        if (!settings.hasOwnProperty('autoCraft')) {
            settings.autoCraft = true;
        }
        if (!settings.hasOwnProperty('autoARPA')) {
            settings.autoARPA = true;
        }
        if (!settings.hasOwnProperty('autoBuild')) {
            settings.autoBuild = true;
        }
        if (!settings.hasOwnProperty('autoResearch')) {
            settings.autoResearch = true;
        }
        if (!settings.hasOwnProperty('autoJobs')) {
            settings.autoJobs = true;
        }
        if (!settings.hasOwnProperty('autoPower')) {
            settings.autoPower = true;
        }
        if (!settings.hasOwnProperty('autoTradeSpecialResources')) {
            settings.autoTradeSpecialResources = true;
        }
        if (!settings.hasOwnProperty('autoSmelter')) {
            settings.autoSmelter = true;
        }
        if (!settings.hasOwnProperty('autoFactory')) {
            settings.autoFactory = true;
        }
        if (!settings.hasOwnProperty('autoMAD')) {
            settings.autoMAD = true;
        }
        if (!settings.hasOwnProperty('autoSpace')) {
            settings.autoSpace = false; // Space currently equals less plasmids so off by default. Also kind of conflicts with MAD don't you think?
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

        autoGatherResource(state.evolutions.Rna, 10);
        autoGatherResource(state.evolutions.Dna, 10);
        
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
        if (craftable.id == state.resources.Plywood.id) {
            craftable.craftRatio = 0.9;
            
            if (state.cityBuildings.Library.count < 20 || state.cityBuildings.Cottage.count < 20) {
                craftable.craftRatio = 0.5;
            }
        }
        
        if (craftable.id == state.resources.Brick.id) {
            craftable.craftRatio = 0.9;
            
            if (state.cityBuildings.Library.count < 20 || state.cityBuildings.Cottage.count < 20) {
                craftable.craftRatio = 0.5;
            }
        }
        
        if (craftable.id == state.resources.WroughtIron.id) {
            craftable.craftRatio = 0.9;
            
            if (state.cityBuildings.Cottage.count < 20) {
                craftable.craftRatio = 0.5;
            }
        }
        
        if (craftable.id == state.resources.SheetMetal.id) {
            craftable.craftRatio = 0.9;
            
            if (state.cityBuildings.Wardenclyffe.count < 20) {
                craftable.craftRatio = 0.5;
            }
        }
    }

    //#endregion Auto Crafting

    //#region Auto Battle

    function autoBattle() {
        // Don't send our troops out if we're preparing for MAD as we need all troops at home for maximum plasmids
        if (state.goal == "PreparingMAD") {
            return;
        }
        
        let tabElms = document.querySelectorAll('#tabs div.b-tabs nav.tabs ul li');
        let soldierCounts = document.querySelector('#garrison .barracks > span:nth-child(2)').textContent.split(' / ');
        let woundedCount = parseInt(document.querySelector('#garrison .barracks:nth-child(2) > span:nth-child(2)').textContent);
        let battleButton = document.querySelector('#garrison > div:nth-child(4) > div:nth-child(2) > span > button');
        let addBattalion = document.querySelector('#battalion > .add');
        if (tabElms.item(2).className = "is-active") {
            // @ts-ignore
            addBattalion.click();
            
            if (!switchAttackTypeIfRequired()) {
                return;
            }
            
            if (soldierCounts[0] == soldierCounts[1] && parseInt(soldierCounts[0]) != 0 && woundedCount == 0) {
                // @ts-ignore
                battleButton.click();
            }
        }
    }

   /**
     * @return {boolean}
     */
    function switchAttackTypeIfRequired() {
        let offensiveRating = parseInt(document.querySelector('#garrison > div:nth-child(1) > span:nth-child(2) > span:nth-child(2)').textContent);
        let attackType = document.querySelector('#tactics > span:nth-child(3) > span').textContent;
        let increaseAttackDifficultyBtn = document.querySelector('#tactics > span:nth-child(4)');
        let decreaseAttackDifficultyBtn = document.querySelector('#tactics > span:nth-child(2)');
        
        if (offensiveRating > 500 && attackType == "Siege") {
            return true;
        } else if (offensiveRating > 500 && attackType != "Siege") {
            // @ts-ignore
            increaseAttackDifficultyBtn.click();
            return false;
        }
        
        if (offensiveRating > 200 && attackType == "Assault") {
            return true;
        } else if (offensiveRating > 200 && attackType != "Assault") {
            if (attackType == "Siege") {
                // @ts-ignore
                decreaseAttackDifficultyBtn.click();
                return false;
            } else {
                // @ts-ignore
                increaseAttackDifficultyBtn.click();
                return false;
            }
        }
        
        if (offensiveRating > 100 && attackType == "Pillage") {
            return true;
        } else if (offensiveRating > 100 && attackType != "Pillage") {
            if (attackType == "Siege" || attackType == "Assault") {
                // @ts-ignore
                decreaseAttackDifficultyBtn.click();
                return false;
            } else {
                // @ts-ignore
                increaseAttackDifficultyBtn.click();
                return false;
            }
        }
        
        if (offensiveRating > 50 && attackType == "Raid") {
            return true;
        } else if (offensiveRating > 50 && attackType != "Raid") {
            if (attackType == "Siege" || attackType == "Assault" || attackType == "Pillage") {
                // @ts-ignore
                decreaseAttackDifficultyBtn.click();
                return false;
            } else {
                // @ts-ignore
                increaseAttackDifficultyBtn.click();
                return false;
            }
        }
        
        if (attackType == "Ambush") {
            return true;
        } else if (attackType != "Ambush") {
            if (attackType == "Siege" || attackType == "Assault" || attackType == "Pillage" || attackType == "Raid") {
                // @ts-ignore
                decreaseAttackDifficultyBtn.click();
                return false;
            } else {
                // @ts-ignore
                increaseAttackDifficultyBtn.click();
                return false;
            }
        }
        
        return true;
    }

    //#endregion Auto Battle
    
    //#region Auto Jobs

    /**
     * @param {string} jobType
     * @return {number}
     */
    function getUnfilledJobsSplit(jobType) {
        if (document.getElementById('civ-' + jobType).style.display != 'none') {
            let btnArray = document.querySelector('#civ-' + jobType + ' .job_label > span:nth-child(2)').textContent.split(' / ');
            let availableJobs = parseInt(btnArray[1]);
            let filledJobs = parseInt(btnArray[0]);
            
            if (jobType == "miner" || jobType == "banker") {
                if (state.resources.Population.currentQuantity <= 60) {
                    if (availableJobs > 3) {
                        availableJobs = 3;
                    }
                }
            }

            // We don't want more cement workers if we don't have any stone
            if (jobType == "cement_worker" && state.resources.Stone.rateOfChange < 8) {
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
        if (document.getElementById('civ-' + jobType).style.display != 'none') {
            return parseInt(document.querySelector('#civ-' + jobType + ' .job_label > span:nth-child(2)').textContent);
        }
        
        return 0;
    }
    
    /**
     * @param {number} unemployed
     */
    function unassignJobsIfRequired(unemployed) {
        if (document.getElementById('civ-farmer').style.display != 'none') {
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
            
            if (document.getElementById('civ-miner').style.display != 'none') {
                let minerArray = document.querySelector('#civ-miner .job_label > span:nth-child(2)').textContent.split(' / ');
                
                if (minerArray[0] != minerArray[1] && (parseInt(minerArray[0]) < 3 || state.resources.Population.currentQuantity > 60))
                {
                    let minerAddButton = document.querySelector('#civ-miner .controls > .add');
                    // @ts-ignore
                    minerAddButton.click();
                }
            }
            
            clickJobSplitButtonIfRequired("coal_miner");
            
            if (document.getElementById('civ-banker').style.display != 'none') {
                let bankerArray = document.querySelector('#civ-banker .job_label > span:nth-child(2)').textContent.split(' / ');
                
                if (bankerArray[0] != bankerArray[1] && (parseInt(bankerArray[0]) < 3 || state.resources.Population.currentQuantity > 60))
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
            
            if (document.getElementById('civ-lumberjack').style.display != 'none') {
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
            
            if (document.getElementById('civ-quarry_worker').style.display != 'none') {
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
        if (jobType == "cement_worker" && state.resources.Stone.rateOfChange < 8) {
            return;
        }

        if (document.getElementById('civ-' + jobType).style.display != 'none')
        {
            let btnArray = document.querySelector('#civ-' + jobType + ' .job_label > span:nth-child(2)').textContent.split(' / ');
            
            if (btnArray[0] != btnArray[1])
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
        // No smelter; no auto smelter
        if (!state.cityBuildings.Smelter.isUnlocked()) {
            log("Smelter is not unlocked");
            return;
        }
        
        // Only one modal window can be open at a time
        // If there is already another modal window open then we can't also open the smelters modal window
        if (state.modal.isOpen() && state.modal.currentModalWindowTitle != "Smelter") {
            log("Smelter other modal window open: " + state.modal.currentModalWindowTitle);
            return;
        }

        // Only adjust smelters once per number of smelters owned. eg. if we own 10 smelters and have already adjusted them
        // then don't adjust them again until we own 11 or more smelters
        if (state.cityBuildings.Smelter.count == state.lastSmelterCount) {
            log("Smelter count same as last time");
            return;
        }

        // Don't adjust smelter if we don't have enough coal. Also don't close the smelter options if the user opens it
        if (state.resources.Coal.rateOfChange < 1.5) {
            if (state.lastSmelterOpenedRateOfChange >= 1.5) {
                state.lastSmelterOpenedRateOfChange = 0;
                state.modal.closeModalWindow();
            }

            return;
        }

        // We want to adjust the smelters iron / steel production so open the smelter options and adjust
        // Open the modal in the first loop
        // Perform the adjustment and close the modal in the second loop
        if (!state.modal.isOpen()) {
            log("Smelter opening modal window");
            let smelterBtn = document.querySelector('#city-smelter');
            
            if (smelterBtn != null)
            {
                state.lastSmelterOpenedRateOfChange = state.resources.Coal.rateOfChange;
                state.modal.openModalWindow();
                // @ts-ignore
                smelterBtn.children[1].click();
                return;
            } else {
                return;
            }
        }
        
        log("Smelter adjusting");

        let smelterSteelBtn = document.querySelector('#specialModal .smelting > span:nth-child(2) > button');
        
        if (smelterSteelBtn === null) {
            log("Smelter can't find steel button");
            state.lastSmelterCount = state.cityBuildings.Smelter.count;
            state.lastSmelterOpenedRateOfChange = 0;
            state.modal.closeModalWindow();
            return;
        }
        
        let smelterIronBtn = document.querySelector('#specialModal .smelting > span:nth-child(1) > button');
        let smelterIronCount = parseInt(smelterIronBtn.textContent.split(': ')[1]);
        let smelterSteelCount = parseInt(smelterSteelBtn.textContent.split(': ')[1]);
        
        if (state.cityBuildings.Cottage.count < 20) {
            if (smelterSteelCount < smelterIronCount) {
                log("Smelter adding steel 1");
                // @ts-ignore
                smelterSteelBtn.click();
            } else {
                log("Smelter closing 1");
                state.lastSmelterCount = state.cityBuildings.Smelter.count;
                state.lastSmelterOpenedRateOfChange = 0;
                state.modal.closeModalWindow();
            }
        } else if (state.cityBuildings.CoalMine.count < 10) {
            if (smelterIronCount * 2 > smelterSteelCount) {
                log("Smelter adding steel 2");
                // @ts-ignore
                smelterSteelBtn.click();
            } else {
                log("Smelter closing 2");
                state.lastSmelterCount = state.cityBuildings.Smelter.count;
                state.lastSmelterOpenedRateOfChange = 0;
                state.modal.closeModalWindow();
            }
        } else if (smelterIronCount > 2) {
            log("Smelter adding steel 3");
            // @ts-ignore
            smelterSteelBtn.click();
        } else {
            log("Smelter closing 3");
            state.lastSmelterCount = state.cityBuildings.Smelter.count;
            state.lastSmelterOpenedRateOfChange = 0;
            state.modal.closeModalWindow();
        }
    }

    //#endregion Auto Smelter
    
    //#region Auto Factory

    function autoFactory() {
        // No factory; no auto factory
        if (!state.cityBuildings.Factory.isUnlocked()) {
            return;
        }
        
        // Only one modal window can be open at a time
        // If there is already another modal window open then we can't also open the factories modal window
        if (state.modal.isOpen() && state.modal.currentModalWindowTitle != "Factory") {
            return;
        }

        // Only adjust factories once per number of factories owned. eg. if we own 10 factories and have already adjusted them
        // then don't adjust them again until we own 11 or more factories
        if (state.cityBuildings.Factory.count == state.lastFactoryCount) {
            return;
        }

        // We want to adjust the factory production so open the factory options and adjust
        // Open the modal in the first loop
        // Perform the adjustment and close the modal in the second loop
        if (!state.modal.isOpen()) {
            //log("Factory opening modal window");
            let factoryBtn = document.querySelector('#city-factory');
            
            if (factoryBtn != null)
            {
                state.modal.openModalWindow();
                // @ts-ignore
                factoryBtn.children[1].click()
                return;
            } else {
                return;
            }
        }
    
        let factoryAlloyBtn = document.querySelector('#specialModal .factory .add');
        
        if (factoryAlloyBtn === null) {
            state.lastFactoryCount = state.cityBuildings.Factory.count;
            state.modal.closeModalWindow();
            return;
        }
        
        let factoriesProducingAlloyArrayNode = document.querySelector('#specialModal');
        if (factoriesProducingAlloyArrayNode != null) {
            var factoriesProducingAlloyArray = factoriesProducingAlloyArrayNode.children[0].querySelector("span:nth-child(2)").textContent.split("/");
        }
        
        if (parseInt(factoriesProducingAlloyArray[0]) < parseInt(factoriesProducingAlloyArray[1])) {
            let alloyAddBtn = document.querySelector('#specialModal').getElementsByClassName("factory")[1].querySelector(".add");
            // @ts-ignore
            alloyAddBtn.click();
        } else {
            state.lastFactoryCount = state.cityBuildings.Factory.count;
            state.modal.closeModalWindow();
        }
    }

    //#endregion Auto Factory
    
    //#region Auto MAD

    function autoMAD() {
        if (!state.resources.Population.isUnlocked()) {
            return;
        }
        
        // Let's wait until we have a good enough population count
        if (state.goal != "PreparingMAD" && state.resources.Population.currentQuantity < 245) {
            return;
        }
        
        // Can't kill ourselves if we don't have nukes yet...
        let armMissilesBtn = document.querySelector('#mad button.arm');
        if (state.goal != "PreparingMAD" && armMissilesBtn === null) {
            return;
        }
        
        let launchMissilesBtn = document.querySelector('#mad > div > div:nth-child(3) .button');
        
        if (state.goal != "PreparingMAD" || (state.goal == "PreparingMAD" && launchMissilesBtn["disabled"])) {
            // @ts-ignore
            armMissilesBtn.click();
            state.goal = "PreparingMAD";
        }
        
        let soldierCounts = document.querySelector('#garrison .barracks > span:nth-child(2)').textContent.split(' / ');
        let woundedCount = parseInt(document.querySelector('#garrison .barracks:nth-child(2) > span:nth-child(2)').textContent);
        if (soldierCounts[0] == soldierCounts[1]&& woundedCount == 0) {
            // Push... the button
            state.goal = "GameOverMan";
            // @ts-ignore
            launchMissilesBtn.click();
        }
    }

    //#endregion Auto MAD
    
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
        
        if (multipliers.length >= 5) {
            multipliers[4].click();
        }
        else {
            multipliers[2].click();
            tradeQuantity = 100;
        }
        
        setTimeout(function() { //timeout needed to let the click on multiplier take effect
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
        }, 25);
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

            if (targetBuilding == null && state.cityBuildings.Cottage.autoBuildEnabled && state.cityBuildings.Cottage.isUnlocked()) {
                state.cityBuildings.Cottage.tryBuild();
                if (state.cityBuildings.Cottage.count < 10) {
                    log("Target building: cottage");
                    targetBuilding = state.cityBuildings.Cottage;
               }
            }
            
            if (targetBuilding == null && state.cityBuildings.CoalMine.autoBuildEnabled && state.cityBuildings.CoalMine.isUnlocked()) {
                state.cityBuildings.CoalMine.tryBuild();
                if (state.cityBuildings.CoalMine.count < 5) {
                    log("Target building: coal mine");
                    targetBuilding = state.cityBuildings.CoalMine;
               }
            }

            if (targetBuilding == null && state.cityBuildings.StorageYard.autoBuildEnabled && state.cityBuildings.StorageYard.isUnlocked()) {
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
            if (targetBuilding != null) {
                if (targetBuilding.requiredBasicResourcesToAction.some(r => building.requiredBasicResourcesToAction.includes(r))) {
                    log(building.id + " DOES conflict with target building " + targetBuilding.id);
                    continue;
                } else {
                    log(building.id + " DOES NOT conflict with target building " + targetBuilding.id);
                }
            }

            // Only build the following buildings if we have enough production to cover what they use
            if (building.id == state.cityBuildings.Smelter.id) {
                buildIfEnoughProduction(building, state.resources.Lumber, 12);
                continue;
            }

            if (building.id == state.cityBuildings.CoalPower.id) {
                buildIfEnoughProduction(building, state.resources.Coal, 2.35);
                continue;
            }

            if (!settings.autoSpace && state.resources.Plasmids.currentQuantity > 2000 && building.id == state.cityBuildings.OilPower.id) {
                buildIfCountLessThan(building, 5);
                continue;
            } else if (building.id == state.cityBuildings.OilPower.id) {
                buildIfEnoughProduction(building, state.resources.Oil, 2.65);
                continue;
            }

            if (building.id == state.cityBuildings.FissionPower.id) {
                buildIfEnoughProduction(building, state.resources.Uranium, 0.5);
                continue;
            }

            // If we're not going to space and we have a lot of plasmids then we don't need as many buildings. In fact, too many will slow us down
            if (!settings.autoSpace && state.resources.Plasmids.currentQuantity > 2000 && building.id == state.cityBuildings.OilWell.id) {
                buildIfCountLessThan(building, 3);
                continue;
            }
            if (!settings.autoSpace && state.resources.Plasmids.currentQuantity > 2000 && building.id == state.cityBuildings.OilDepot.id) {
                buildIfCountLessThan(building, 2);
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
                // Don't research fanaticism (always research anthropology instead)
                if (items[i].id.indexOf('fanaticism') == -1) {
                    // @ts-ignore
                    items[i].children[0].click();
                    break;
                }
            }
        }
    }

    //#endregion Auto Research

    //#region Auto ARPA

    function autoArpa() {
        if (settings.arpa.lhc) {
            let btn = document.querySelector("#arpalhc > div.buy > button.button.x1");
            if (btn != null && !wouldBreakMoneyFloor(26500)) {
                // @ts-ignore
                btn.click();
            }
        }
        if (settings.arpa.stock_exchange) {
            let btn = document.querySelector("#arpastock_exchange > div.buy > button.button.x1");
            if (btn != null && ! wouldBreakMoneyFloor(30000)) {
                // @ts-ignore
                btn.click();
            }
        }
        if (settings.arpa.monument) {
            let btn = document.querySelector("#arpamonument > div.buy > button.button.x1");
            if (btn != null) {
                // @ts-ignore
                btn.click();
            }
        }
        if (settings.arpa.launch_facility) {
            let btn = document.querySelector("#arpalaunch_facility > div.buy > button.button.x1");
            if (btn != null) {
                // @ts-ignore
                btn.click();
            }
        }
        
        // Always sequence genome if possible
        let sequenceBtn = document.querySelector("#arpaSequence .button");
        if (sequenceBtn != null) {
            let sequenceValue = document.querySelector("#arpaSequence .progress")["value"];
            
            if (sequenceValue == state.lastGenomeSequenceValue) {
                // @ts-ignore
                sequenceBtn.click();
            }
            
            state.lastGenomeSequenceValue = sequenceValue;
        }
    }

    //#endregion Auto ARPA
    
    //#region Auto Power

    /**
     * @param {Action} building
     * @param {number} availablePower
     * @param {number} powerUsage
     * @return {boolean}
     */
    function checkAndClickBuildingPowerOn(building, availablePower, powerUsage) {
        log("building: " + building.id + ", stateOffCount: " + building.stateOffCount + ", availablePower " + availablePower + ", powerUsage: " + powerUsage)
        if (building.stateOffCount > 0 && availablePower >= powerUsage) {
        log("turning on building: " + building.id);
            building.trySetStateOn();
            return true;
        }
        
        return false;
    }
    
    /**
     * @param {Action} building
     * @return {boolean}
     */
    function checkAndClickBuildingPowerOff(building) {
        log("stateOnCount: " + building.stateOnCount);
        if (building.stateOnCount > 0) {
        log("turning off building: " + building.id);
            building.trySetStateOff();
            return true;
        }
        
        return false;
    }
    
    /**
     * @param {string} text
     */
    function log(text) {
        if (settings.autoLogging) {
            console.log(text);
        }
    }
    
    function unpowerBuildingsIfRequired() {
        let availablePowerNode = document.querySelector('#powerMeter');
        
        if (availablePowerNode === null) {
            return;
        }
        
        let availablePower = parseInt(availablePowerNode.textContent);
        if (availablePower > 5) {
            return;
        }
        
        let totalUnpowered = state.cityBuildings.Apartment.stateOffCount + state.cityBuildings.Wardenclyffe.stateOffCount
            + state.cityBuildings.BioLab.stateOffCount + state.cityBuildings.Mine.stateOffCount
            + state.cityBuildings.CementPlant.stateOffCount + state.cityBuildings.Sawmill.stateOffCount
            + state.cityBuildings.RockQuarry.stateOffCount + state.cityBuildings.CoalMine.stateOffCount
            + state.cityBuildings.Factory.stateOffCount;
            
        log("totalUnpowered: " + totalUnpowered);
        
        if (availablePower < 0) {
            totalUnpowered-= availablePower;
        }
        
        if (totalUnpowered > 0) {
            totalUnpowered -= state.cityBuildings.Factory.stateOffCount;
            if (checkAndUnpowerBuilding(state.cityBuildings.Factory, totalUnpowered)) { return state.cityBuildings.Factory.id };
            
            totalUnpowered -= state.cityBuildings.CoalMine.stateOffCount;
            if (checkAndUnpowerBuilding(state.cityBuildings.CoalMine, totalUnpowered)) { return state.cityBuildings.CoalMine.id };
        
            totalUnpowered -= state.cityBuildings.RockQuarry.stateOffCount;
            if (checkAndUnpowerBuilding(state.cityBuildings.RockQuarry, totalUnpowered)) { return state.cityBuildings.RockQuarry.id };
            
            totalUnpowered -= state.cityBuildings.Sawmill.stateOffCount;
            if (checkAndUnpowerBuilding(state.cityBuildings.Sawmill, totalUnpowered)) { return state.cityBuildings.Sawmill.id };
        }
    }
    
    /**
     * @param {Action} building
     * @param {number} totalUnpowered
     * @return {boolean}
     */
    function checkAndUnpowerBuilding(building, totalUnpowered) {
        if (totalUnpowered <= 0) {
            return false;
        }
        
        if (building.stateOnCount > 0 && totalUnpowered > 0) {
            checkAndClickBuildingPowerOff(building);
            return true;
        }
        
        return false;
    }
    
    function autoPower() {
        let availablePowerNode = document.querySelector('#powerMeter');
        
        if (availablePowerNode === null) {
            return;
        }
        
        let unpoweredBuilding = unpowerBuildingsIfRequired();
        
        let availablePower = parseInt(availablePowerNode.textContent);
        
        // Power generating
        checkAndClickBuildingPowerOn(state.cityBuildings.Mill, availablePower, 0);
        
        // Power consuming
        if (checkAndClickBuildingPowerOn(state.cityBuildings.Apartment, availablePower, 1)) { return; }
        if (checkAndClickBuildingPowerOn(state.cityBuildings.Wardenclyffe, availablePower, 2)) { return; } else if (state.cityBuildings.Wardenclyffe.stateOffCount > 0) { return; }
        if (checkAndClickBuildingPowerOn(state.cityBuildings.BioLab, availablePower, 2)) { return; } else if (state.cityBuildings.BioLab.stateOffCount > 0) { return; }
        if (checkAndClickBuildingPowerOn(state.cityBuildings.Mine, availablePower, 1)) { return; }
        if (checkAndClickBuildingPowerOn(state.cityBuildings.CementPlant, availablePower, 2)) { return; } else if (state.cityBuildings.CementPlant.stateOffCount > 0) { return; }
        
        if (unpoweredBuilding == state.cityBuildings.Sawmill.id) { return };
        if (checkAndClickBuildingPowerOn(state.cityBuildings.Sawmill, availablePower, 1)) { return; }
        
        if (unpoweredBuilding == state.cityBuildings.RockQuarry.id) { return };
        if (checkAndClickBuildingPowerOn(state.cityBuildings.RockQuarry, availablePower, 1)) { return; }
        
        if (unpoweredBuilding == state.cityBuildings.CoalMine.id) { return };
        if (checkAndClickBuildingPowerOn(state.cityBuildings.CoalMine, availablePower, 1)) { return; }
        
        if (unpoweredBuilding == state.cityBuildings.Factory.id) { return };
        if (checkAndClickBuildingPowerOn(state.cityBuildings.Factory, availablePower, 3)) {
            // Reset the factory count so that we will check factory settings again
            state.lastFactoryCount = 0;
            return;
        } else if (state.cityBuildings.Factory.stateOffCount > 0) { return; }
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
        if (resourceTradeNode != null && resourceTradeNode.style.display != 'none') {
            resourceTradeNode = resourceTradeNode.querySelector('.trade');
            let currentTrade = resourceTradeNode.querySelector(".current").textContent;
            if (parseInt(currentTrade) < requiredRoutes) {
                // @ts-ignore
                resourceTradeNode.querySelector("span:nth-child(2) .sub .route").click();
            }
        }
    }
    
    function autoTradeSpecialResources() {
        // Automatically trade for easier resources
        autoTradeResource(state.resources.Titanium, 5);

        if (state.resources.Population.currentQuantity < 220) {
            autoTradeResource(state.resources.Alloy, 5);
        } else {
            autoTradeResource(state.resources.Alloy, 10);
        }

        autoTradeResource(state.resources.Polymer, 1);

        
        // Slow down steel a bit so that we can build a few Wardenclyffe's before other steel related structures
        if (state.cityBuildings.Wardenclyffe.count < 12) {
            if (assignCrates(state.resources.Steel, 10)) { return };
        } else {
            if (assignCrates(state.resources.Steel, 20)) { return };
        }

        if (assignCrates(state.resources.Titanium, 20)) { return };
        if (assignCrates(state.resources.Alloy, 20)) { return };
        if (assignCrates(state.resources.Polymer, 20)) { return };

        if (settings.autoSpace) {
            if (assignCrates(state.resources.Iridium, 20)) { return };
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

        // We already have more crates assigned to this resource than what is being requested
        if (resource.isAssignedCratesUpdated && resource.assignedCrates >= nbrCrates) {
            log("resource: " + resource.id + ", enough crates 1, assigned: " + resource.assignedCrates);
            return false;
        }
        
        // There can only be one modal active at a time. If there is another modal active then don't continue
        if (state.modal.isOpen() && state.modal.currentModalWindowTitle != resource.id) {
            log("resource: " + resource.id + ", other modal active: " + state.modal.currentModalWindowTitle);
            return false;
        }

        // If the resources lastConstructStorageAttemptLoopCounter is not 0 then we are attempting to construct a crate (or not enough room to construct a crate).
        // Did we succeed? If so then reset the lastConstructStorageAttemptLoopCounter. Otherwise wait some number of loops and try again.
        if (resource.lastConstructStorageAttemptLoopCounter != 0 && state.resources.Crates.currentQuantity != state.lastCratesOwned) {
            log("resource: " + resource.id + " successfully constructed a crate, current crates: " + state.resources.Crates.currentQuantity);

            // Successfully constructed a crate so leave the modal window open and continue
            resource.lastConstructStorageAttemptLoopCounter = 0;
        } else if (resource.lastConstructStorageAttemptLoopCounter != 0
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
        if ($('#evolution') != null && ($('#evolution')[0].style.display != 'none') || $('#topBar > span')[0].textContent == "Prehistoric") {
            state.goal = "Evolution";
        } else if (state.goal == "Evolution") {
            state.goal = "Standard";
        }

        state.modal.openThisLoop = false;
    }

    function automate() {
        updateState();
        updateUI();
        
        if (state.goal == "Evolution") {
            if (settings.autoEvolution) {
                autoEvolution();
            }
        } else if (state.goal != "GameOverMan") {
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
                autoPower();
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
        if ($('#autoScriptContainer').length == 0) {
            let autoScriptContainer = $('<div id="autoScriptContainer"></div>');
            $('#resources').append(autoScriptContainer);
        }
        
        let autoScriptContainerNode = document.querySelector('#autoScriptContainer');
        if (autoScriptContainerNode.nextSibling != null) {
            autoScriptContainerNode.parentNode.appendChild(autoScriptContainerNode);
        }
        
        if ($('#autoEvolution').length == 0) {
            createSettingToggle('autoEvolution');
        }
        if ($('#autoFight').length == 0) {
            createSettingToggle('autoFight');
        }
        if ($('#autoCraft').length == 0) {
            createSettingToggle('autoCraft', createCraftToggles, removeCraftToggles);
        } else if (settings.autoCraft && $('.ea-craft-toggle').length == 0) {
            createCraftToggles();
        }
        if ($('#autoBuild').length == 0) {
            createSettingToggle('autoBuild', createBuildingToggles, removeBuildingToggles);
        } else if (settings.autoBuild && $('.ea-building-toggle').length == 0) {
            createBuildingToggles();
        }
        if ($('#autoMarket').length == 0 && isMarketUnlocked()) {
            createSettingToggle('autoMarket', createMarketToggles, removeMarketToggles);
        } else if (settings.autoMarket > 0 && $('.ea-market-toggle').length == 0 && isMarketUnlocked()) {
            createMarketToggles()
        }
        if ($('#autoResearch').length == 0) {
            createSettingToggle('autoResearch');
        }
        if ($('#autoARPA').length == 0) {
            createSettingToggle('autoARPA', createArpaToggles, removeArpaToggles);
        } else if (settings.autoArpa && $('.ea-arpa-toggle').length == 0) {
            createArpaToggles();
        }
        if ($('#autoJobs').length == 0) {
            createSettingToggle('autoJobs');
        }
        if ($('#autoPower').length == 0) {
            createSettingToggle('autoPower');
        }
        if ($('#autoTradeSpecialResources').length == 0) {
            createSettingToggle('autoTradeSpecialResources');
        }
        if ($('#autoSmelter').length == 0) {
            createSettingToggle('autoSmelter');
        }
        if ($('#autoFactory').length == 0) {
            createSettingToggle('autoFactory');
        }
        if ($('#autoMAD').length == 0) {
            createSettingToggle('autoMAD');
        }
        if ($('#autoSpace').length == 0) {
            createSettingToggle('autoSpace');
        }
        if ($('#autoLogging').length == 0) {
            createSettingToggle('autoLogging');
        }
        if ($('#bulk-sell').length == 0 && isMarketUnlocked()) {
            let bulkSell = $('<a class="button is-dark is-small" id="bulk-sell"><span>Bulk Sell</span></a>');
            $('#autoScriptContainer').append(bulkSell);
            bulkSell.on('mouseup', function(e) {
                autoMarket(true, true);
            });
        } if ($('#ea-settings').length == 0) {
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
        
        if (document.querySelector('#arpalaunch_facility') != null) {
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

        var numericPortion = parseFloat(amountText);
        var lastChar = amountText[amountText.length - 1];

        if (numberSuffix[lastChar] != null) {
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

    //#endregion Utility Functions

// @ts-ignore
})($);
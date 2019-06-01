// ==UserScript==
// @name         Evolve
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       Fafnir
// @match        https://pmotschmann.github.io/Evolve/
// @grant        none
// @require      https://code.jquery.com/jquery-3.3.1.min.js
// ==/UserScript==

(function($) {
    'use strict';
    var settings = {};
    var jsonSettings = localStorage.getItem('settings');
    if(jsonSettings != null){
        settings = JSON.parse(jsonSettings);
    }

    /***
    *
    * Setup resources informations and settings
    *
    ***/

    var resources = [
        {
            name:"Food",
            autobuy:false,
            autosell:false,
            buyRatio:0.5,
            sellRatio:0.6
        },
        {
            name:"Lumber",
            autobuy:false,
            autosell:false,
            buyRatio:0.5,
            sellRatio:0.7
        },
        {
            name:"Stone",
            autobuy:false,
            autosell:false,
            buyRatio:0.5,
            sellRatio:0.6
        },
        {
            name:"Furs",
            autobuy:false,
            autosell:false,
            buyRatio:0.5,
            sellRatio:0.7
        },
        {
            name:"Copper",
            autobuy:false,
            autosell:false,
            buyRatio:0.5,
            sellRatio:0.5
        },
        {
            name:"Iron",
            autobuy:false,
            autosell:false,
            buyRatio:0.5,
            sellRatio:0.7
        },
        {
            name:"Cement",
            autobuy:false,
            autosell:false,
            buyRatio:0.3,
            sellRatio:0.7
        },
        {
            name:"Coal",
            autobuy:false,
            autosell:false,
            buyRatio:0.5,
            sellRatio:0.5
        },
        {
            name:"Oil",
            autobuy:false,
            autosell:false,
            buyRatio:0.5,
            sellRatio:0.5
        },
        {
            name:"Uranium",
            autobuy:false,
            autosell:false,
            buyRatio:0.5,
            sellRatio:0.5
        },
        {
            name:"Steel",
            autobuy:false,
            autosell:false,
            buyRatio:0.5,
            sellRatio:0.7
        },
        {
            name:"Titanium",
            autobuy:false,
            autosell:false,
            buyRatio:0.8,
            sellRatio:0.5
        },
        {
            name:"Alloy",
            autobuy:false,
            autosell:false,
            buyRatio:0.8,
            sellRatio:0.5
        },
        {
            name:"Polymer",
            autobuy:false,
            autosell:false,
            buyRatio:0.8,
            sellRatio:0.5
        }
    ];

    for (let i = 0; i < resources.length; i++) {
        resources[i].buyValues = [];
        resources[i].sellValues = [];
        let skey = 'sell' + resources[i].name;
        if(settings.hasOwnProperty(skey)){
            resources[i].autosell = settings[skey];
        }else{
            settings[skey] = false;
        }
        let bkey = 'buy' + resources[i].name;
        if(settings.hasOwnProperty(bkey)){
            resources[i].autobuy = settings[bkey];
        }else{
            settings[bkey] = false;
        }
    }

    var craftableResources = [
        {
            name:"Plywood",
            ratio:0.5,
            enabled:false,
            source: resources[1],//wood
        },
        {
            name:"Brick",
            ratio:0.5,
            enabled:false,
            source: resources[6],//cement
        },{
            name:"Wrought_Iron",
            ratio:0.5,
            enabled:false,
            source: resources[5],//iron
        },
        {
            name:"Sheet_Metal",
            ratio:0.5,
            enabled:false,
            source: resources[10],//steel
        }
    ];

    for (let i = 0; i < craftableResources.length; i++) {
        let buyContainer = document.getElementById("inc" + craftableResources[i].name + "5");
        if(buyContainer === null){
            continue; //craft not unlocked
        }
        craftableResources[i].buyBtn = buyContainer.getElementsByTagName("a")[0];
        let skey = 'craft' + craftableResources[i].name;
        if(settings.hasOwnProperty(skey)){
            craftableResources[i].enabled = settings[skey];
        }else{
            settings[skey] = false;
        }
    }

    var buildings = [
        {
            name: "university",
            enabled: false,
        },{
            name: "wardenclyffe",
            enabled: false,
        },{
            name: "mine",
            enabled: false,
        },{
            name: "coal_mine",
            enabled: false,
        },{
            name: "smelter",
            enabled: false,
        },{
            name: "coal_power",
            enabled: false,
        },{
            name: "temple",
            enabled: false,
        },{
            name: "oil_well",
            enabled: false,
        },{
            name: "biolab",
            enabled: false,
        },{
            name: "storage_yard",
            enabled: false,
        },{
            name: "warehouse",
            enabled: false,
        },{
            name: "oil_power",
            enabled: false,
        },{
            name: "bank",
            enabled: false,
        },{
            name: "garrison",
            enabled: false,
        },{
            name: "house",
            enabled: false,
        },{
            name: "cottage",
            enabled: false,
        },{
            name: "apartment",
            enabled: false,
        },{
            name: "farm",
            enabled: false,
        },{
            name: "mill",
            enabled: false,
        },{
            name: "silo",
            enabled: false,
        },{
            name: "shed",
            enabled: false,
        },{
            name: "lumber_yard",
            enabled: false,
        },{
            name: "rock_quarry",
            enabled: false,
        },{
            name: "cement_plant",
            enabled: false,
        },{
            name: "foundry",
            enabled: false,
        },{
            name: "factory",
            enabled: false,
        },{
            name: "oil_depot",
            enabled: false,
        },{
            name: "trade",
            enabled: false,
        },{
            name: "amphitheatre",
            enabled: false,
        },{
            name: "library",
            enabled: false,
        },{
            name: "sawmill",
            enabled: false,
        },{
            name: "fission_power",
            enabled: false,
        },{
            name: "lodge",
            enabled: false,
        },{
            name: "smokehouse",
            enabled: false,
        }
    ];
    for (let i = 0; i < buildings.length; i++) {
        let buyContainer = document.getElementById("city-" + buildings[i].name);
        if(buyContainer === null){
            continue; //building not unlocked
        }
        buildings[i].buyBtn = buyContainer.getElementsByTagName("a")[0];
        let skey = 'bat' + buildings[i].name;
        if(settings.hasOwnProperty(skey)){
            buildings[i].enabled = settings[skey];
        }else{
            settings[skey] = false;
        }
    }

    function updateSettings(){
        for (let i = 0; i < buildings.length; i++) {
            settings['bat' + buildings[i].name] = buildings[i].enabled;
        }
        for (let i = 0; i < craftableResources.length; i++) {
            settings['craft' + craftableResources[i].name] = craftableResources[i].enabled;
        }
        for (let i = 0; i < resources.length; i++) {
            settings['buy' + resources[i].name] = resources[i].autobuy;
            settings['sell' + resources[i].name] = resources[i].autosell;
        }
        if(!settings.hasOwnProperty('autoMarket')){
            settings.autoMarket = true;
        }
        if(!settings.hasOwnProperty('autoFight')){
            settings.autoFight = true;
        }
        if(!settings.hasOwnProperty('autoCraft')){
            settings.autoCraft = true;
        }
        if(!settings.hasOwnProperty('autoARPA')){
            settings.autoARPA = true;
        }
        if(!settings.hasOwnProperty('autoBuild')){
            settings.autoBuild = true;
        }
        if(!settings.hasOwnProperty('autoResearch')){
            settings.autoResearch = true;
        }
        if(!settings.hasOwnProperty('minimumMoney')){
            settings.minimumMoney = 0;
        }
        if(!settings.hasOwnProperty('arpa')){
            settings.arpa = {
                lhc: false,
                stock_exchange: false,
                monument: false
            };
        }
        localStorage.setItem('settings', JSON.stringify(settings));
    }


    updateSettings();

    /***
    *
    * automation functions
    *
    ***/
    function autoCraft() {
        for (let i = 0; i < craftableResources.length; i++) {
            let res = craftableResources[i];
            if(!isResourceUnlocked(res)){
                continue;
            }
            let counter = 0;
            while(res.enabled && counter++<1 && getResourceRatio(res.source) > res.ratio){
                res.buyBtn.click();
                setTimeout(5);
            }
        }
    }

    function autoBattle() {
        let tabElms = document.querySelectorAll('#tabs div.b-tabs nav.tabs ul li');
        let soldierCounts = document.querySelector('#garrison .barracks > span:nth-child(2)').innerText.split(' / ');
        let woundedCount = document.querySelector('#garrison .barracks:nth-child(2) > span:nth-child(2)').innerText;
        let battleButton = document.querySelector('#garrison > div:nth-child(4) > div:nth-child(2) > span > button');
        let addBattalion = document.querySelector('#battalion > .add');
        if (tabElms.item(2).className = "is-active") {
            addBattalion.click();
            if (soldierCounts[0] == soldierCounts[1] && woundedCount == 0) {
                battleButton.click();
            }
        }
    }

    function autoMarket(bulkSell, ignoreSellRatio) {
        let moneyResource = {name:"Money"};
        let current = getResourceAmount(moneyResource);
        let max = getResourceStorage(moneyResource);
        let ratio = current / max;
        let toFull = max - current;
        let multipliers = $('#market-qty').children();
        multipliers[2].click();
        let qty = 100;
        setTimeout(function(){ //timeout needed to let the click on multiplier take effect
            for(let i = 0; i<resources.length; i++){
                let resource = resources[i];
                if(!isResourceUnlocked(resource)){
                    continue;
                }
                let resCurrent = getResourceAmount(resource);
                let resMax = getResourceStorage(resource);
                if(resource.autosell === true && (ignoreSellRatio ? true : resCurrent / resMax > resource.sellRatio)){
                    let sellBtn = $('#market-'+resource.name+' .order')[1];
                    let value = sellBtn.innerHTML.substr(1);
                    let sellValue = getRealValue(parseFloat(value), value);
                    let counter = 0;
                    while(true){
                        //break if not enough resource or not enough money storage
                        if(current + sellValue >= max || resCurrent - qty <=0 || counter++ > 10) {
                            break;
                        }
                        current += sellValue;
                        resCurrent -= qty;
                        sellBtn.click();
                    }

                }
                if(bulkSell === true){
                    continue;
                }
                if(resource.autobuy === true && resCurrent / resMax < resource.buyRatio){
                    let buyBtn = $('#market-'+resource.name+' .order')[0];
                    let value = buyBtn.innerHTML.substr(1);
                    let buyValue = getRealValue(parseFloat(value), value);
                    let counter = 0;
                    while(true){
                        //break if not enough money or not enough resource storage
                        if(current - buyValue <= settings.minimumMoney || resCurrent + qty > resMax - 3 * qty || counter++ > 2) {
                            break;
                        }
                        current -= buyValue;
                        resCurrent += qty;
                        buyBtn.click();
                    }
                }
            }
        }, 25);
    }

    function autoBuild(){
        for(let i = 0; i < buildings.length; i++){
            let bat = buildings[i];
            if(bat.enabled){
                let buyContainer = document.getElementById("city-" + buildings[i].name);
                if(buyContainer === null){
                    continue; //building not unlocked
                }
                buyContainer.getElementsByTagName("a")[0].click();
            }
        }
    }

    function autoResearch(){
        let items = document.querySelectorAll('#tech .action');
        for(let i = 0; i < items.length; i++){
            if(items[i].className.indexOf("cna") < 0){
                if(items[i].className.indexOf('fanaticism') == -1 && items[i].className.indexOf('anthropology') == -1 ){
                    items[i].children[0].click();
                    break;
                }
            }
        }
    }

    function autoArpa(){
        if(settings.arpa.lhc){
            let btn = document.querySelector("#arpalhc > div.buy > button.button.x1");
            if(btn != null && !wouldBreakMoneyFloor(26500)){
                btn.click();
            }
        }
        if(settings.arpa.stock_exchange){
            let btn = document.querySelector("#arpastock_exchange > div.buy > button.button.x1");
            if(btn != null && ! wouldBreakMoneyFloor(30000)){
                btn.click();
            }
        }
        if(settings.arpa.monument){
            let btn = document.querySelector("#arpamonument > div.buy > button.button.x1");
            if(btn != null){
                btn.click();
            }
        }
    }

    function automate() {
        updateUI();
        if(settings.autoFight){
            autoBattle();
        }
        setTimeout(125);
        if(settings.autoARPA){
            autoArpa();
        }
        if(settings.autoBuild){
            autoBuild();
        }
        if(settings.autoCraft){
            autoCraft();
        }
        if(settings.autoResearch){
            autoResearch();
        }
        if(settings.autoMarket && isMarketUnlocked()){
            autoMarket();
        }
    }

    setInterval(automate, 1000);


    /***
    *
    * Setup UI
    *
    ***/
    function createSettingToggle(name, enabledCallBack, disabledCallBack){
        let elm = $('#resources');
        let toggle = $('<label tabindex="0" class="switch" id="'+name+'" style=""><input type="checkbox" value=false> <span class="check"></span><span>'+name+'</span></label></br>');
        elm.append(toggle);
        if(settings[name]){
            toggle.click();
            toggle.children('input').attr('value', true);
            if(enabledCallBack !== undefined){
                enabledCallBack();
            }
        }
        toggle.on('mouseup', function(e){
            let input = e.currentTarget.children[0];
            let state = !(input.getAttribute('value') === "true");
            input.setAttribute('value', state);
            settings[name] = state;
            updateSettings();
            if(state && enabledCallBack !== undefined){
                enabledCallBack();
            } else if(disabledCallBack !== undefined){
                disabledCallBack()
            }
        });
    }

    function updateUI(){
        if($('#evolution') != null && $('#evolution')[0].style.display === 'none'){
            if($('#autoFight').length == 0){
                createSettingToggle('autoFight');
            }
            if($('#autoCraft').length == 0){
                createSettingToggle('autoCraft', createCraftToggles, removeCraftToggles);
            }else if(settings.autoCraft && $('.ea-craft-toggle').length == 0){
                createCraftToggles();
            }
            if($('#autoBuild').length == 0){
                createSettingToggle('autoBuild', createBuildingToggles, removeBuildingToggles);
            }else if(settings.autoBuild && $('.ea-building-toggle').length == 0){
                createBuildingToggles();
            }
            if($('#autoMarket').length == 0 && isMarketUnlocked()){
                createSettingToggle('autoMarket', createMarketToggles, removeMarketToggles);
            }else if(settings.autoMarket > 0 && $('.ea-market-toggle').length == 0 && isMarketUnlocked()){
                createMarketToggles()
            }
            if($('#autoResearch').length == 0){
                createSettingToggle('autoResearch');
            }
            if($('#autoARPA').length == 0){
                createSettingToggle('autoARPA', createArpaToggles, removeArpaToggles);
            }else if(settings.autoArpa && $('.ea-arpa-toggle').length == 0){
                createArpaToggles();
            }
            if($('#bulk-sell').length == 0 && isMarketUnlocked()){
                let bulkSell = $('<a class="button is-dark is-small" id="bulk-sell"><span>Bulk Sell</span></a>');
                $('#resources').append(bulkSell);
                bulkSell.on('mouseup', function(e){
                    autoMarket(true, true);
                });
            }if($('#ea-settings').length == 0){
                let settingsDiv = $('<div id="ea-settings"></div>');
                let minMoneyTxt = $('<div>Minimum money to keep :</div>')
                let minMoneyInput = $('<input type="text" class="input is-small" style="width:32%"/>');
                minMoneyInput.val(settings.minimumMoney);
                let setBtn = $('<a class="button is-dark is-small" id="set-min-money"><span>set</span></a>');
                settingsDiv.append(minMoneyTxt).append(minMoneyInput).append(setBtn);
                $('#resources').append(settingsDiv);

                setBtn.on('mouseup', function(){
                    let val = minMoneyInput.val();
                    let minMoney = getRealValue(parseFloat(val), val);
                    if(!isNaN(minMoney)){
                        console.log('setting minimum money to : '+minMoney);
                        settings.minimumMoney = minMoney;
                        updateSettings();
                    }
                });
            }
        }else{
            settings.autoBuild = false;
            settings.autoFight = false;
            settings.autoARPA = false;
            settings.autoCraft = false;
            settings.autoResearch = false;
            settings.autoMarket = false;
        }
    }

    function createArpaToggle(name){
        let arpaDiv = $('#arpa'+name +' .head');
        let toggle = $('<label tabindex="0" class="switch ea-arpa-toggle" style="position:relative; max-width:75px;margin-top: -36px;left:45%;float:left;"><input type="checkbox" value=false> <span class="check" style="height:5px;"></span></label>');
        arpaDiv.append(toggle);
        if(settings.arpa[name]){
            toggle.click();
            toggle.children('input').attr('value', true);
        }
        toggle.on('mouseup', function(e){
            let input = e.currentTarget.children[0];
            let state = !(input.getAttribute('value') === "true");
            input.setAttribute('value', state);
            settings.arpa[name] = state;
            updateSettings();
        });
    }

    function createArpaToggles(){
        removeArpaToggles();
        createArpaToggle('lhc');
        createArpaToggle('stock_exchange');
        createArpaToggle('monument');
    }

    function removeArpaToggles(){
        $('.ea-arpa-toggle').remove();
    }

    function createCraftToggle(resource){
        let resourceSpan = $('#res'+resource.name);
        let toggle = $('<label tabindex="0" class="switch ea-craft-toggle" style="position:absolute; max-width:75px;margin-top: 4px;left:8%;"><input type="checkbox" value=false> <span class="check" style="height:5px;"></span></label>');
        resourceSpan.append(toggle);
        if(resource.enabled){
            toggle.click();
            toggle.children('input').attr('value', true);
        }
        toggle.on('mouseup', function(e){
            let input = e.currentTarget.children[0];
            let state = !(input.getAttribute('value') === "true");
            input.setAttribute('value', state);
            resource.enabled = state;
            updateSettings();
        });
    }

    function createCraftToggles(){
        removeCraftToggles();
        for (let i = 0; i < craftableResources.length; i++) {
            let res = craftableResources[i];
            createCraftToggle(res);
        }
    }

    function removeCraftToggles(){
        $('.ea-craft-toggle').remove();
    }

    function createBuildingToggle(bat){
        let batElmt = $('#city-'+bat.name);
        let toggle = $('<label tabindex="0" class="switch ea-building-toggle" style="position:absolute; margin-top: 30px;left:8%;"><input type="checkbox" value=false> <span class="check" style="height:5px; max-width:15px"></span></label>');
        batElmt.append(toggle);
        if(bat.enabled){
            toggle.click();
            toggle.children('input').attr('value', true);
        }
        toggle.on('mouseup', function(e){
            let input = e.currentTarget.children[0];
            let state = !(input.getAttribute('value') === "true");
            input.setAttribute('value', state);
            bat.enabled = state;
            updateSettings();
        });
    }

    function createBuildingToggles(){
        removeBuildingToggles();
        for (let i = 0; i < buildings.length; i++) {
            let building = buildings[i];
            createBuildingToggle(building);
        }
    }

    function removeBuildingToggles(){
        $('.ea-building-toggle').remove();
    }

    function createMarketToggle(resource){
        let marketRow = $('#market-'+resource.name);
        let toggleBuy = $('<label tabindex="0" class="switch ea-market-toggle" style=""><input type="checkbox" value=false> <span class="check" style="height:5px;"></span><span class="control-label" style="font-size: small;">auto buy (&lt'+resource.buyRatio+')</span><span class="state"></span></label>');
        let toggleSell = $('<label tabindex="0" class="switch ea-market-toggle" style=""><input type="checkbox" value=false> <span class="check" style="height:5px;"></span><span class="control-label" style="font-size: small;">auto sell (&gt'+resource.sellRatio+')</span><span class="state"></span></label>');
        marketRow.append(toggleBuy);
        marketRow.append(toggleSell);
        if(resource.autobuy){
            toggleBuy.click();
            toggleBuy.children('input').attr('value', true);
        }
        if(resource.autosell){
            toggleSell.click();
            toggleSell.children('input').attr('value', true);
        }
        toggleBuy.on('mouseup', function(e){
            console.log(e);
            let input = e.currentTarget.children[0];
            let state = !(input.getAttribute('value') === "true");
            input.setAttribute('value', state);
            resource.autobuy = state;
            let otherState = toggleSell.children('input').attr('value') === 'true';
            if(state && otherState){
                toggleSell.click();
                toggleSell.trigger('mouseup');
            }
            updateSettings();
            console.log(state);
        });
        toggleSell.on('mouseup', function(e){
            console.log(e);
            let input = e.currentTarget.children[0];
            let state = !(input.getAttribute('value') === "true");
            input.setAttribute('value', state);
            resource.autosell = state;
            let otherState = toggleBuy.children('input').attr('value') === 'true';
            if(state && otherState){
                toggleBuy.click();
                toggleBuy.trigger('mouseup');
            }
            updateSettings();
            console.log(state);
        });
    }

    function createMarketToggles(){
        removeMarketToggles();
        for (let i = 0; i < resources.length; i++) {
            let res = resources[i];
            createMarketToggle(res);
        }
    }

    function removeMarketToggles(){
        $('.ea-market-toggle').remove();
    }

    /***
    *
    * Utilities
    *
    ***/
    var suffix = {
        K:1000,
        M:1000000
    }

    function getRealValue(nb, str){
        var currSuff = /[0-9.]+(\D+)/.exec(str);
        if(currSuff != null && suffix[currSuff[1]] != null){
            nb *= suffix[currSuff[1]];
        }
        return nb;
    }

    function getResourceAmount(res){
        var resource_ammount = document.getElementById("cnt" + res.name).innerHTML;
        var array = resource_ammount.split(" / ");
        var current = parseFloat(array[0]);
        return getRealValue(current, array[0]);
    }

    function getResourceStorage(res){
        var resource_ammount = document.getElementById("cnt" + res.name).innerHTML;
        var array = resource_ammount.split(" / ");
        var max = parseFloat(array[1]);
        return getRealValue(max, array[1]);
    }

    function getResourceRatio(res){
        var current = getResourceAmount(res);
        var max = getResourceStorage(res);
        return current / max;
    }

    function isResourceUnlocked(resource){
        return $('#res'+resource.name)[0].style.display != 'none';
    }

    function isMarketUnlocked(){
        return $('#tech-market > .oldTech').length > 0;
    }

    function wouldBreakMoneyFloor(buyValue){
        let money = getResourceAmount({name:"Money"});
        return money - buyValue < settings.minimumMoney;
    }
})($);
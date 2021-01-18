"use strict";

(function(){
//import {*} from 'igo.js';
const igo = window.igo = window.igo || {};
const EMPTY = igo.EMPTY;
const BLACK = igo.BLACK;
const WHITE = igo.WHITE;
const NPOS = igo.NPOS;
const POS_PASS = igo.POS_PASS;
const POS_RESIGN = igo.POS_RESIGN;
const Game = igo.Game;
const getOppositeColor = igo.getOppositeColor;
const BoardChanges = igo.BoardChanges;

function clamp(x, xmin, xmax){
    return x < xmin ? xmin : x > xmax ? xmax : x;
}

//
// HTML UI Utilities
//

function appendChildren(element, children){
    if(Array.isArray(children)){
        for(const child of children){
            appendChildren(element, child);
        }
    }
    else if(children instanceof Node){
        element.appendChild(children);
    }
    else if(typeof(children) == "string"){
        //element.insertAdjacentHTML("beforeend", children);
        element.appendChild(document.createTextNode(children));
    }
    return element;
}

function createElementNS(ns, elemName, attrs, children, parent){
    const elem = ns ?
          document.createElementNS(ns, elemName) :
          document.createElement(elemName);
    for(const attr in attrs){
        elem.setAttributeNS(null, attr, attrs[attr]);
    }
    appendChildren(elem, children);
    if(parent){
        parent.appendChild(elem);
    }
    return elem;
}

function createSVG(elemName, attrs, children, parent){
    return createElementNS("http://www.w3.org/2000/svg", elemName, attrs, children, parent);
}

function createElement(elemName, attrs, children, parent){
    return createElementNS(null, elemName, attrs, children, parent);
}

function createDialogWindow(attrs, children, parent, opt){
    opt = opt || {};
    parent = parent || document.body;
    if(!attrs){
        attrs = {};
    }
    attrs["class"] += " igo-dialog-window";
    if(attrs.style === undefined){
        attrs.style =
            "user-select:none;"+
            "border: 1px solid black;"+
            "background-color:rgba(250, 250, 250, 0.8);"+
            "position:fixed;"+
            "left:4.5%;"+
            "top:1em;"+
            "box-sizing: border-box;"+
            "max-width:90%;"+
            "padding:1em 1em;";
    }
    const dialog = createElement("div", attrs, children, parent);

    function isEventOutside(e){
        let target = e.target;
        while(target && target != dialog){
            target = target.parentNode;
        }
        return target != dialog;
    }
    function onOutsideClick(e){
        if(isEventOutside(e)){
            e.stopPropagation();
            if(opt.closeOnOutsideClick){
                close();
            }
        }
    }
    function onOutsideEvent(e){
        if(isEventOutside(e)){
            e.stopPropagation();
        }
    }
    document.addEventListener("click", onOutsideClick, true);
    document.addEventListener("mousemove", onOutsideEvent, true);
    document.addEventListener("mousedown", onOutsideEvent, true);
    document.addEventListener("mouseup", onOutsideEvent, true);

    function close(){
        parent.removeChild(dialog);
        document.removeEventListener("click", onOutsideClick, true);
        document.removeEventListener("mousemove", onOutsideEvent, true);
        document.removeEventListener("mousedown", onOutsideEvent, true);
        document.removeEventListener("mouseup", onOutsideEvent, true);
    }

    dialog.close = close;
    return dialog;
}

function createPopupMenu(x, y, items, parent){
    const ITEM_BG_NORMAL = "";
    const ITEM_BG_HOVER = "rgba(200, 200, 200, 1.0)";
    const ITEM_COLOR_DISABLED = "#888";

    const menuDiv = createDialogWindow({"class":"igo-popup-menu"}, [
        items.map(item=>{
            if(item.visible === false){ //default:true
                return null;
            }
            const itemDiv = createElement("div", {
                style: "padding:4px 1em"}, item.text);
            if(item.disabled){
                itemDiv.style.color = ITEM_COLOR_DISABLED;
                return itemDiv;
            }
            itemDiv.addEventListener("click", e=>{
                if(item.handler){
                    item.handler();
                }
                menuDiv.close();
            }, false);
            itemDiv.addEventListener("mouseenter", e=>{
                itemDiv.style.backgroundColor = ITEM_BG_HOVER;
            }, false);
            itemDiv.addEventListener("mouseleave", e=>{
                itemDiv.style.backgroundColor = ITEM_BG_NORMAL;
            }, false);
            return itemDiv;
        })
    ], parent, {closeOnOutsideClick:true});
    menuDiv.style.padding = "4px 1px";

    // supress overflow
    const bcr = menuDiv.getBoundingClientRect();
    const menuW = bcr.right - bcr.left;
    const menuH = bcr.bottom - bcr.top;
    if(x + menuW > window.innerWidth){
        x = window.innerWidth - menuW;
    }
    if(y + menuH > window.innerHeight){
        y = window.innerHeight - menuH;
    }
    menuDiv.style.left = x + "px";
    menuDiv.style.top = y + "px";
}

function createTextDialog(message, text, children, onOk, parent){
    let textarea;
    const dialog = createDialogWindow({}, [
        createElement("div", {}, message),
        textarea = createElement("textarea", {
            style: "display:block;"+
                   "margin: auto;"+
                   "max-width:100%;"+
                   "width:40em;"+
                   "height:4em;"}),
        children,
        createElement(
            "div", {"class":"igo-control-bar", style:"text-align:right"},
            onOk instanceof Array ? onOk :
            typeof(onOk) == "string" ? createButton(onOk, close) :
            onOk ? [
                createButton("OK", ()=>{close(); onOk();}),
                createButton("Cancel", close)
            ] :
            createButton("OK", close)
        )
    ], parent);
    textarea.value = text;
    textarea.focus();

    function close(){
        dialog.close();
    }
    return {dialog, textarea};
}

function createButton(value, onClick, parent){
    const button = createElement("input", {
        type: "button",
        value: value}, [], parent);
    button.addEventListener('click', onClick, false);
    return button;
}

function createCheckbox(text, checked, onChange, parent){
    let checkbox;
    const label = createElement("label", {}, [
        checkbox = createElement("input", {type:"checkbox"}),
        text
    ], parent);
    checkbox.checked = checked;
    checkbox.addEventListener('change', onChange, false);
    label.checkbox = checkbox;
    return label;
}

function createRadioButtons(name, items, onChange, parent){
    const labels = [];
    const inputs = [];
    for(const item of items){
        let input;
        const label = createElement("label", {}, [
            input = createElement("input", {type:"radio", name, value:item.value}),
            item.text,
            item.children
        ], parent);
        if(item.checked){
            input.checked = true;
        }
        input.addEventListener('change', onChangeItem, false);
        labels.push(label);
        inputs.push(input);
    }
    function onChangeItem(e){
        const checkedInput = inputs.find(i=>i.checked);
        if(checkedInput){
            onChange(checkedInput.value);
        }
    }
    function getByValue(value){
        return inputs.find(i=>i.value == value);
    }
    function selectByValue(value){
        const item = getByValue(value);
        if(item){
            item.checked = true;
        }
    }
    function getValue(){
        const checkedInput = inputs.find(i=>i.checked);
        return checkedInput ? checkedInput.value : null;
    }
    labels.radio = {
        getByValue,
        selectByValue,
        getValue
    };
    return labels;
}

function showMessage(text, element){
    const bcr = element.getBoundingClientRect();
    const maxWidth = bcr.right - bcr.left;
    const left = window.scrollX + bcr.left;
    const top = window.scrollY + bcr.top;
    const div = createElement("div", {
        style:"position:absolute;"+
            "left:"+left+"px;"+
            "top:"+top+"px;"+
            "box-sizing:border-box;"+
            "max-width:"+ maxWidth + "px;"+
            "padding:1em 2em;"+
            "background:rgba(255,255,255,0.75);"+
            "border: 1px solid #888;"+
            "user-select:none;"+
            "pointer-events:none;"}, text, document.body);
    const timeoutId = setTimeout(hide, 1000);
    function hide(){
        if(div.parentNode){
            div.parentNode.removeChild(div);
            clearTimeout(timeoutId);
        }
    }
    return {hide};
}


//
// HTML BoardElement
//

class BoardElement{
    // .onIntersectionClick = (x, y, e)=>{}
    // .onStoneClick = (x, y, e)=>{}
    // .overlays.appendChild()

    constructor(w, h, opt){
        opt = opt || {};
        this.w = w;
        this.h = h;

        this.stonePointerEvents = "auto";

        const gridInterval = this.gridInterval = opt.gridInterval || 32;
        const gridMargin = this.gridMargin = opt.gridMargin || 50;

        const boardPixelW = this.boardPixelW = this.gridMargin*2+this.gridInterval*(this.w-1);
        const boardPixelH = this.boardPixelH = this.gridMargin*2+this.gridInterval*(this.h-1);

        const lineWidth = 1;
        const starRadius = 2.5;

        const rootElement = this.rootElement = this.element = createSVG(
            "svg", {"class": "igo-board"},
            [
                this.defineStoneGradient(),

                // Board
                createSVG("rect",{x:0, y:0, width:boardPixelW, height:boardPixelH, fill:"#e3aa4e"}),

                // Grid Root (origin is top left of grid)
                this.gridRoot = createSVG("g", {
                    "class":"igo-board-grid-root",
                    style:"pointer-events:none;",
                    transform:"translate(" + (gridMargin-0.5) + " " + (gridMargin-0.5) + ")" //adjust pixel coordinates for sharper lines
                },[
                    // Grid
                    createSVG("g", {"class":"igo-board-grid"}, [
                        // Lines
                        Array.from({length:w}, (u,x)=>{
                            const lineX = gridInterval * x;
                            return createSVG("line", {x1:lineX, y1:-lineWidth/2, x2:lineX, y2:gridInterval*(h-1)+lineWidth/2, stroke:"black", "stroke-width":lineWidth});
                        }),
                        Array.from({length:h}, (u,y)=>{
                            const lineY = gridInterval * y;
                            return createSVG("line", {y1:lineY, x1:-lineWidth/2, y2:lineY, x2:gridInterval*(w-1)+lineWidth/2, stroke:"black", "stroke-width":lineWidth});
                        }),
                        // Stars
                        (w&1 && h&1) ? createSVG("circle", {cx:gridInterval*((w-1)/2), cy:gridInterval*((h-1)/2), r:starRadius}) : null,
                        (w>=13 && h>=13) ? [
                            createSVG("circle", {cx:gridInterval*3, cy:gridInterval*3, r:starRadius}),
                            createSVG("circle", {cx:gridInterval*(w-4), cy:gridInterval*3, r:starRadius}),
                            createSVG("circle", {cx:gridInterval*3, cy:gridInterval*(h-4), r:starRadius}),
                            createSVG("circle", {cx:gridInterval*(w-4), cy:gridInterval*(h-4), r:starRadius})
                        ] : null,
                        (w>=19 && h>=19 && w&1) ? [
                            createSVG("circle", {cx:gridInterval*((w-1)/2), cy:gridInterval*3, r:starRadius}),
                            createSVG("circle", {cx:gridInterval*((w-1)/2), cy:gridInterval*(h-4), r:starRadius}),
                        ] : null,
                        (w>=19 && h>=19 && h&1) ? [
                            createSVG("circle", {cx:gridInterval*3    , cy:gridInterval*((h-1)/2), r:starRadius}),
                            createSVG("circle", {cx:gridInterval*(w-4), cy:gridInterval*((h-1)/2), r:starRadius})
                        ] : null
                    ]),

                    // Layers
                    this.shadows = createSVG("g", {"class":"igo-board-shadows"}),
                    this.stones = createSVG("g", {"class":"igo-board-stones"}),
                    this.overlays = createSVG("g", {"class":"igo-board-overlays"}),
                ])

            ]);

        // Intersections
        this.intersections = new Array(w * h);
        for(let pos = 0; pos < this.intersections.length; ++pos){
            this.intersections[pos] = {state:EMPTY, elements:null};
        }

        // Viewport
        this.elementScale = 1.0; //SVG要素のサイズの縮尺(width=, height=に影響)
        this.scrollScale = 1.0; //表示する内容の縮尺(viewBox=に影響) 1.0 ~
        this.scrollX = 0; // スクロール位置(viewBox=に影響) 0 ~ (this.scrollScale - 1) * this.viewArea.width
        this.scrollY = 0; // スクロール位置(viewBox=に影響) 0 ~ (this.scrollScale - 1) * this.viewArea.height
        this.viewArea = {left:0, top:0, right:boardPixelW, bottom:boardPixelH, width:boardPixelW, height:boardPixelH}; //盤の中の表示する範囲(viewBox=に影響)
        this.updateWidthHeightViewBox();

        // Input
        rootElement.addEventListener("click", (e)=>{
            const eventPos = this.convertEventPosition(e);
            const x = eventPos.x;
            const y = eventPos.y;
            if(x >= 0 && y >= 0 && x < w && y < h){
                if(this.onIntersectionClick){
                    this.onIntersectionClick(x, y, e);
                }
            }
        }, false);

    }

    // Position

    toPosition(x, y){ //intersection index
        return x >= 0 && x < this.w && y >= 0 && y < this.h ?
            x + y * this.w :
            -1;
    }

    toPixelX(x){return x * this.gridInterval;}
    toPixelY(y){return y * this.gridInterval;}

    convertElementPosition(xOnElement, yOnElement){
        // coordinates for this.rootElement
        const rootX = this.viewArea.left + (xOnElement / this.elementScale + this.scrollX) / this.scrollScale;
        const rootY = this.viewArea.top + (yOnElement / this.elementScale + this.scrollY) / this.scrollScale;
        // coordinates for this.gridRoot, this.shadows, this.stones, this.overlays
        const gridX = rootX - this.gridMargin;
        const gridY = rootY - this.gridMargin;
        // coordinates for board model
        const x = Math.floor(gridX / this.gridInterval + 0.5);
        const y = Math.floor(gridY / this.gridInterval + 0.5);
        return {rootX, rootY, gridX, gridY, x, y};
    }
    convertEventPosition(event){
        const bcr = this.rootElement.getBoundingClientRect();
        return this.convertElementPosition(
            event.clientX - bcr.left,
            event.clientY - bcr.top);
    }

    // Stone

    defineStoneGradient(){
        return createSVG("defs", {}, [
            createSVG("radialGradient", {
                id:"stone-black", cx:0.5, cy:0.5, fx:0.7, fy:0.3, r:0.55}, [
                    createSVG("stop", {offset:"0%", "stop-color":"#606060"}),
                    createSVG("stop", {offset:"100%", "stop-color":"#000000"})
                ]),
            createSVG("radialGradient", {
                id:"stone-white", cx:0.5, cy:0.5, fx:0.7, fy:0.3, r:0.6}, [
                    createSVG("stop", {offset:"0%", "stop-color":"#ffffff"}),
                    createSVG("stop", {offset:"80%", "stop-color":"#e0e0e0"}),
                    createSVG("stop", {offset:"100%", "stop-color":"#b0b0b0"})
                ])
        ]);
    }

    createStone(x, y, color){
        const cx = this.toPixelX(x);
        const cy = this.toPixelY(y);
        const BLACK_R = 0.5*22.2/22.2 * 0.98;
        const WHITE_R = 0.5*21.9/22.2 * 0.98;
        const r = this.gridInterval * (color == BLACK ? BLACK_R : WHITE_R);

        // shadow
        const shadow = createSVG("circle", {cx:cx-2, cy:cy+2, r:r, fill:"rgba(0,0,0,0.3)"});
        // stone
        const fill = color == BLACK ? "url(#stone-black)" : "url(#stone-white)";
        const stone = createSVG("circle", {cx, cy, r, fill, style:"cursor:pointer;"});
        stone.stoneData = {x, y, color};

        return {stone, shadow};
    }

    createStoneOnIntersection(x, y, color){
        const elements = this.createStone(x, y, color);
        elements.stone.style.pointerEvents = this.stonePointerEvents;
        const dispatcher = e=>{
            if(this.onStoneEvent){
                this.onStoneEvent(x, y, e);
            }
        };
        elements.stone.addEventListener("mousemove", dispatcher, false);
        elements.stone.addEventListener("click", dispatcher, false);
        return elements;
    }
    setStonePointerEventsEnabled(enabled){
        this.setStonePointerEvents(enabled ? "auto" : "none");
    }
    setStonePointerEvents(pointerEvents){
        this.stonePointerEvents = pointerEvents;
        // update all stones
        for(const intersection of this.intersections){
            if(intersection.elements && intersection.elements.stone){
                intersection.elements.stone.style.pointerEvents = pointerEvents;
            }
        }
    }

    // Update Intersection State

    putStone(x, y, color){
        if(color == BLACK || color == WHITE){
            this.setIntersectionState(x, y, color);
        }
    }
    removeStone(x, y){
        this.setIntersectionState(x, y, EMPTY);
    }
    setIntersectionState(x, y, state, forced){
        const pos = this.toPosition(x, y);
        if(pos >= 0){
            const intersection = this.intersections[pos];
            if(intersection.state != state || forced){
                this.removeIntersectionElements(intersection);
                if(state == BLACK || state == WHITE){
                    const elements = this.createStoneOnIntersection(x, y, state);
                    this.shadows.appendChild(elements.shadow);
                    this.stones.appendChild(elements.stone);
                    intersection.elements = elements;
                }
                intersection.state = state;
            }
        }
    }
    removeIntersectionElements(intersection){
        if(intersection && intersection.elements){
            for(const name in intersection.elements){
                const elem = intersection.elements[name];
                elem.parentNode.removeChild(elem);
            }
            intersection.elements = null;
        }
    }
    removeAllStones(){
        for(const intersection of this.intersections){
            this.removeIntersectionElements(intersection);
            intersection.state = EMPTY;
        }
    }
    setAllIntersections(getter){
        for(let y = 0; y < this.h; ++y){
            for(let x = 0; x < this.w; ++x){
                this.setIntersectionState(
                    x, y,
                    getter(x, y));
            }
        }
    }

    // Overlays

    getIntersectionTextColor(x, y, forBlack, forWhite, forEmpty){
        const pos = this.toPosition(x, y);
        const state = pos >= 0 ? this.intersections[pos].state : EMPTY;
        return state == BLACK ? (forBlack || "#fff") :
            state == WHITE ? (forWhite || "#000") :
            (forEmpty || "#fff");
    }

    createCircleMark(x, y, markColor){
        return createSVG("circle", {
            cx: this.toPixelX(x),
            cy: this.toPixelY(y),
            r: this.gridInterval * 0.3,
            "stroke-width": 3,
            stroke: markColor || this.getIntersectionTextColor(x, y),
            fill: "none"});
    }
    createSquareMark(x, y, markColor){
        const r = this.gridInterval * 0.25;
        return createSVG("rect", {
            x: this.toPixelX(x) - r,
            y: this.toPixelY(y) - r,
            width: 2*r,
            height: 2*r,
            "stroke-width": 3,
            stroke: markColor || this.getIntersectionTextColor(x, y),
            fill: "none"});
    }
    createTriangleMark(x, y, markColor){
        const cx = this.toPixelX(x);
        const cy = this.toPixelY(y);
        const r = this.gridInterval * 0.3;
        return createSVG("polygon", {
            points: cx + "," + (cy - r*Math.sqrt(3)*0.55) + " " +
                (cx + r) + "," + (cy + r*Math.sqrt(3)*0.45) + " " +
                (cx - r) + "," + (cy + r*Math.sqrt(3)*0.45),
            "stroke-width": 3,
            stroke: markColor || this.getIntersectionTextColor(x, y),
            fill: "none"});
    }
    createCrossMark(x, y, markColor){
        const r = this.gridInterval * 0.25;
        const cx = this.toPixelX(x);
        const cy = this.toPixelY(y);
        return createSVG("path", {
            d: "M " + (cx-r) + "," + (cy-r) + " " +
               "L " + (cx+r) + "," + (cy+r) + " " +
               "M " + (cx+r) + "," + (cy-r) + " " +
               "L " + (cx-r) + "," + (cy+r),
            "stroke-width": 3,
            stroke: markColor || this.getIntersectionTextColor(x, y),
            fill: "none"});
    }

    createText(x, y, text, textColor, fontSizeRate){
        const textX = this.toPixelX(x);
        const textY = this.toPixelY(y);
        const fontSize = Math.ceil(this.gridInterval* (fontSizeRate || 0.65));
        const textElem = createSVG("text", {
            x: textX,
            y: textY,
            fill: textColor || this.getIntersectionTextColor(x, y),
            style:
                "font-weight:bold;"+
                "font-family:arial;"+
                "font-size:" + fontSize +"px;"+
                "user-select:none;",
            "text-anchor": "middle",
            "alignment-baseline": "central"
        }, [text]);
        if(text.length >= 3){
            textElem.setAttributeNS(null, "textLength", Math.ceil(this.gridInterval * 0.85));
            textElem.setAttributeNS(null, "lengthAdjust", "spacingAndGlyphs");
        }
        return textElem;
    }
    addElementOnStone(id, x, y, element, afterStone){
        const pos = this.toPosition(x, y);
        if(pos >= 0){
            const intersection = this.intersections[pos];
            if(intersection.elements && intersection.elements.stone &&
               (intersection.state == BLACK || intersection.state == WHITE)){
                if(afterStone){
                    this.stones.insertBefore(element, intersection.elements.stone.nextSibling);
                }
                else{
                    this.stones.appendChild(element);
                }
                if(id){
                    intersection.elements[id] = element;
                }
                return element;
            }
            else{
                this.stones.appendChild(element);
            }
        }
        return null;
    }
    addTextOnStone(id, x, y, text, textColor, fontSizeRate){
        return this.addElementOnStone(
            id, x, y,
            this.createText(x, y, text, textColor || this.getIntersectionTextColor(x, y, "#ddd", "#444", "#444"), fontSizeRate));
    }
    createOverlayText(x, y, text, fill, onClick){
        const elem = this.createText(x, y, text, fill);
        elem.style.cursor = "pointer";
        this.overlays.appendChild(elem);
        if(onClick){
            elem.style.pointerEvents = "auto";
            elem.addEventListener("click", onClick, false);
            elem.addEventListener("mousemove", (e)=>e.stopPropagation(), false);
        }
        return elem;
    }
    addOverlay(x, y, element){
        this.overlays.appendChild(element);
        return element;
    }

    // Viewport

    getElementScale(){
        return this.elementScale;
    }
    setElementScale(scale){
        this.elementScale = scale;
        this.updateWidthHeightViewBox();
    }
    getScrollScale(){
        return this.scrollScale;
    }
    setScroll(x, y, scale){
        x = this.clampScrollX(x);
        y = this.clampScrollX(y);
        scale = this.clampScrollScale(scale);
        if(x != this.scrollX || y != this.scrollY || scale != this.scrollScale){
            this.scrollScale = scale;
            this.scrollX = x;
            this.scrollY = y;
            this.clampScrollPosition();
            this.updateWidthHeightViewBox();
            return true;
        }
        else{
            return false;
        }
    }
    clampScrollX(x){return clamp(x,this.getScrollXMin(),this.getScrollXMax());}
    clampScrollY(y){return clamp(y,this.getScrollYMin(),this.getScrollYMax());}
    clampScrollScale(scale){return clamp(scale, 1.0, 10.0);}
    clampScrollPosition() {
        // 盤面(viewArea)外が見えないようにスクロール位置を制限する。
        this.scrollX = this.clampScrollX(this.scrollX);
        this.scrollY = this.clampScrollY(this.scrollY);
    }
    getScrollXMin(){ return 0;}
    getScrollYMin(){ return 0;}
    getScrollXMax(){ return (this.scrollScale - 1) * this.viewArea.width;}
    getScrollYMax(){ return (this.scrollScale - 1) * this.viewArea.height;}
    setViewArea(x1, y1, x2, y2){
        const l = clamp(Math.min(x1, x2), 0, this.w-1);
        const t = clamp(Math.min(y1, y2), 0, this.h-1);
        const r = clamp(Math.max(x1, x2), 0, this.w-1);
        const b = clamp(Math.max(y1, y2), 0, this.h-1);

        const left   = Math.floor(this.gridMargin + this.gridInterval * l - (l == 0 ? this.gridMargin : this.gridInterval*0.5));
        const top    = Math.floor(this.gridMargin + this.gridInterval * t - (t == 0 ? this.gridMargin : this.gridInterval*0.5));
        const right  = Math.ceil(this.gridMargin + this.gridInterval * r + (r == this.w-1 ? this.gridMargin : this.gridInterval*0.5));
        const bottom = Math.ceil(this.gridMargin + this.gridInterval * b + (b == this.h-1 ? this.gridMargin : this.gridInterval*0.5));

        const width = (right - left);
        const height = (bottom - top);
        this.viewArea = {left, top, right, bottom, width, height};
        this.clampScrollPosition();
        this.updateWidthHeightViewBox();
    }
    clearViewArea(){
        const width = this.boardPixelW;
        const height = this.boardPixelH;
        this.viewArea = {left:0, top:0, right:width, bottom:height, width, height};
        this.clampScrollPosition();
        this.updateWidthHeightViewBox();
    }
    updateWidthHeightViewBox(){
        const viewBox =
              (this.viewArea.left + this.scrollX / this.scrollScale) + "," +
              (this.viewArea.top + this.scrollY / this.scrollScale) + "," +
              (this.viewArea.width / this.scrollScale) + "," +
              (this.viewArea.height / this.scrollScale);
        const elementW = Math.ceil(this.viewArea.width * this.elementScale);
        const elementH = Math.ceil(this.viewArea.height * this.elementScale);
        this.rootElement.setAttributeNS(null, "viewBox", viewBox);
        this.rootElement.setAttributeNS(null, "width", elementW);
        this.rootElement.setAttributeNS(null, "height", elementH);
    }
}
igo.BoardElement = BoardElement;


//
// GameView
//

function insertGameViewBeforeCurrentScript(game, opt){
    const script = document.currentScript;
    if(script){
        const gameView = new GameView(null, game, opt);
        script.parentNode.insertBefore(gameView.rootElement, script);
        // fitting to added place
        gameView.fitBoardSizeToWindowAndParent();
        return gameView;
    }
    else{
        return null;
    }
}
igo.insertGameViewBeforeCurrentScript = insertGameViewBeforeCurrentScript;

class GameView{
    constructor(placement, game, opt){
        if(typeof(game) == "string"){
            game = Game.fromSGF(game);
        }

        this.filename = null;
        // Options
        function toBool(v, defaultValue){
            return v !== undefined ? v : defaultValue;
        }
        this.opt = opt = opt || {};
        this.editable = toBool(opt.editable, true);
            // Board Option
            // see: backupSession(), restoreSession()
        this.showBranches = toBool(opt.showBranchText, false);
        this.showMoveNumber = toBool(opt.showMoveNumber, false);
        this.showLastMoveMark = toBool(opt.showLastMoveMark, false);
        this.rotate180 = toBool(opt.rotate180, false);
            // History(Undo/Redo) Option
        this.preventRedoAtBranchPoint = toBool(opt.preventRedoAtBranchPoint, false);
        this.autoMove = opt.autoMove; //BLACK, WHITE, true, false
            // Comment Visibility
            // see: backupSession(), restoreSession()
        this.showComment = toBool(opt.showComment, false);

        // Mode
        this.mode = null;
        this.modeStack = [];

        // Root Element
        this.rootElement = createElement("div", {"class":"igo-game"}, [
            // Top Bar
            this.topBar = createElement("div", {"class":"igo-top-bar"}, []),

            // Board Wrapper
            this.boardWrapperRow = createElement("div", {//for board size fitting to parent width
                style: "padding:0; margin:0;"}, [
                    this.boardWrapperBack = createElement("div", {//for swipe & pinch operation
                        style: "padding:0; margin:0; display: inline-block;"
                    })
                ]),

            // Bottom Bar
            this.bottomBar = createElement("div", {"class":"igo-bottom-bar", style:"padding: 1px 0;"}, [])
        ]);

        // Init UI
        this.initMoveModeUI();

        // Insert Root Element
        //
        // 注意:placementをnullにして後から追加する場合は
        // gameView.fitBoardSizeToWindowAndParent();を明示的に呼ぶこと。
        function toElement(id){
            return typeof(id)=="string" ? document.getElementById(id) : id;
        }
        if(placement){
            if(placement instanceof Node){
                if(placement.tagName == "SCRIPT"){
                    placement = {after:placement};
                }
                else{
                    placement = {under:placement};
                }
            }
            else if(typeof(placement) == "string"){
                placement = {under:placement};
            }
            if(placement.after){
                const prevNode = toElement(placement.after);
                prevNode.parentNode.insertBefore(this.rootElement, prevNode.nextSibling);
            }
            else if(placement.before){
                const nextNode = toElement(placement.before);
                nextNode.parentNode.insertBefore(this.rootElement, nextNode);
            }
            else if(placement.under){
                const parent = toElement(placement.under);
                parent.appendChild(this.rootElement);
            }
        }

        // Set Game Model
        this.resetGame(game || new Game(9));

        // Show the node specified by path
        if(this.opt.path){
            game.redoByQuery(this.opt.path);
            this.update();
        }
    }

    resetGame(game){
        if(this.model){
            this.model.board.unhookSetAt();
        }
        this.model = game;
        const w = this.w = this.model.board.w;
        const h = this.h = this.model.board.h;

        //observe board change
        this.model.board.hookSetAt(
            (pos, state)=>this.onIntersectionChange(pos, state));
        this.intersectionDirty = new Array(this.model.board.getIntersectionCount());
        this.invalidAllIntersections();

        // discard old board
        if(this.boardElement){
            this.boardElement.element.parentNode.removeChild(this.boardElement.element);
            this.boardElement = null;
        }

        // Board
        const boardElement = this.boardElement = new BoardElement(w, h, {
            gridInterval: this.opt.gridInterval,
            gridMargin: this.opt.gridMargin,
        });
        this.maxBoardElementScale = 1.0;
        boardElement.element.style.verticalAlign = "top";
        this.boardWrapperBack.appendChild(boardElement.element);

        boardElement.onIntersectionClick = (x, y, e)=>{
            this.onIntersectionClick(this.toModelPosition(x, y), e);
        };

        boardElement.onStoneEvent = (x, y, e)=>{
            this.onStoneEvent(this.toModelPosition(x, y), e);
        };

        this.createPreviewStone();

        this.updateViewArea();

        //
        this.keepBoardScale();
        this.setupSwipePinchOperation();
        if(this.opt.enableWheel !== false){
            this.setupMouseWheelOperation();
        }

        this.update();

        this.startMoveMode();
    }

    backupSession(){
        // UI
        const properties = ["showBranches", "showMoveNumber", "showLastMoveMark", "rotate180", "showComment"];
        for(const propName of properties){
            sessionStorage.setItem(propName, JSON.stringify(this[propName]));
        }
        // path
        const path = this.model.getCurrentNode().getPathFromRoot(false).join(" ");
        sessionStorage.setItem("path", path);
    }
    restoreSession(){
        // UI
        const properties = ["showBranches", "showMoveNumber", "showLastMoveMark", "rotate180", "showComment"];
        for(const propName of properties){
            const propValue = sessionStorage.getItem(propName);
            if(propValue !== undefined){
                this[propName] = JSON.parse(propValue);
            }
        }
        // path
        const pathStr = sessionStorage.getItem("path");
        if(pathStr){
            const dirs = pathStr.split(" ").map(s=>parseInt(s));
            this.model.redoTo(this.model.getRootNode().findByPath(dirs, false));
        }
        // filename (export dialog)
        this.filename = sessionStorage.getItem("filename");
        this.update();
    }

    showMessage(text){
        this.hideMessage();
        this.message = showMessage(text, this.boardElement.element);
    }
    hideMessage(){
        if(this.message){
            this.message.hide();
            this.message = null;
        }
    }

    //
    // Main Menu
    //
    createMenuButton(){
        return createButton("メニュー", (e)=>this.onMenuButtonClick(e));
    }

    onMenuButtonClick(e){
        createPopupMenu(e.clientX, e.clientY, [
            {text:"初期化", handler:()=>this.openResetDialog(), visible:this.editable},
            {text:"SGFインポート", handler:()=>this.importSGF(), visible:this.editable},
            {text:"SGFエクスポート", handler:()=>this.exportSGF()},
            {text:"URL共有", handler:()=>this.openShareDialog()},
            {text:"対局情報", handler:()=>this.openGameInfo()},
            {text:"フリー編集", handler:()=>this.startFreeEditMode(), visible:this.editable},
            {text:"マーク編集", handler:()=>this.startMarkEditMode(), visible:this.editable},
        ]);
    }

    openResetDialog(){
        const dialog = createDialogWindow();

        const currentW = this.model.board.w;
        const currentH = this.model.board.h;

        let buttonCancel;
        const form = createElement("form", {}, [
            createElement("div", {}, [
                createRadioButtons("size", [
                    {value:"9", text:"9 x 9"},
                    {value:"13", text:"13 x 13"},
                    {value:"19", text:"19 x 19"},
                    {value:"custom", text:"custom", checked:true, children:[
                        createElement("input", {type:"number", name:"custom-w", min:1, max:52, value:currentW}),
                        document.createTextNode(" x "),
                        createElement("input", {type:"number", name:"custom-h", min:1, max:52, value:currentH})
                    ]},
                ], updateCustomDisabled).map(elem=>createElement("div", {}, elem))
            ]),
            createElement("div", {"class":"igo-control-bar"}, [
                createElement("input", {type:"submit", value:"OK"}),
                buttonCancel = createElement("input", {type:"button", value:"Cancel"}),
            ])
        ], dialog);

        form.addEventListener("submit", (e)=>{
            e.preventDefault();
            const data = new FormData(form);
            const size = data.get("size");
            const w = parseInt((size=="custom") ? data.get("custom-w") : size);
            const h = parseInt((size=="custom") ? data.get("custom-h") : size);

            this.resetGame(new Game(w, h));
            dialog.close();
        }, false);

        buttonCancel.addEventListener("click", (e)=>{
            dialog.close();
        });

        const checkboxCustom = dialog.querySelector('input[value="custom"]');
        function updateCustomDisabled(){
            dialog.querySelectorAll('.custom > input[type="number"]').forEach(elem=>{
                elem.disabled = ! checkboxCustom.checked;
            });
        }
    }


    //
    // Mode
    //

    startMode(mode){
        this.endMode();
        this.mode = mode;
        this.mode.start();
        this.onBarHeightChanged();
        this.update();
    }
    endMode(){
        if(this.mode){
            this.mode.end();
            this.mode = null;
        }
    }
    pushMode(mode){
        this.modeStack.push(this.mode);
        this.startMode(mode);
    }
    popMode(){
        this.startMode(this.modeStack.pop());
    }


    //
    // Update Contents
    //

    update(){
        this.updateBoard();
        this.updateLastMoveMark();
        this.updateMarkProperty();
        this.updateBranchTexts();
        this.updateMoveModeUI();
    }


    //
    // Board Control
    //

    toModelPosition(x, y){
        return this.model.board.toPosition(
            this.rotate180 ? this.model.board.w - 1 - x : x,
            this.rotate180 ? this.model.board.h - 1 - y : y);
    }
    toBoardElementX(pos){
        const x = this.model.board.toX(pos);
        return this.rotate180 ? this.model.board.w - 1 - x : x;
    }
    toBoardElementY(pos){
        const y = this.model.board.toY(pos);
        return this.rotate180 ? this.model.board.h - 1 - y : y;
    }

    onIntersectionChange(pos, state){
        this.intersectionDirty[pos] = true;
    }

    invalidAllIntersections(){
        this.intersectionDirty.fill(true);
    }

    updateBoard(forced){
        const numIntersections = this.model.board.getIntersectionCount();
        for(let pos = 0; pos < numIntersections; ++pos){
            this.updateIntersection(pos, forced);
        }
    }

    updateIntersection(pos, forced){
        if(!this.model.board.isValidPosition(pos)){return;}

        if(this.intersectionDirty[pos] || forced){
            this.intersectionDirty[pos] = false;

            //apply rotate180 setting
            const viewX = this.toBoardElementX(pos);
            const viewY = this.toBoardElementY(pos);

            const state = this.model.board.getAt(pos);
            this.boardElement.setIntersectionState(viewX, viewY, state, true); //forced reset to remove additional elements(i.e. moveNumber)

            if(this.showMoveNumber && state != EMPTY){
                const moveNumber = this.model.getMoveNumberAt(pos);
                if(moveNumber >= 0){
                    this.boardElement.addTextOnStone("moveNumber", viewX, viewY, "" + moveNumber, undefined, 0.55);
                }
            }
        }
    }

    updateLastMoveMark(){
        if(this.lastMoveMark){
            this.lastMoveMark.parentNode.removeChild(this.lastMoveMark);
            this.lastMoveMark = null;
        }
        if(!this.showLastMoveMark){
            return;
        }
        const node = this.model.getCurrentNode();
        if(node && node.isPlace()){ //ignore pass, resign, root node, setup(?) node
            //apply rotate180 setting
            const viewX = this.toBoardElementX(node.pos);
            const viewY = this.toBoardElementY(node.pos);

            const cx = this.boardElement.toPixelX(viewX);
            const cy = this.boardElement.toPixelY(viewY);
            const r = 0.2 * this.boardElement.gridInterval;
            const mark = createSVG("circle", {cx, cy, r, fill:"rgba(255,30,0, 0.6)", style:"pointer-events:none"});
            this.lastMoveMark = this.boardElement.addOverlay(viewX, viewY, mark, true);
        }
    }

    updateMarkProperty(){
        this.removeMarksOnBoard();
        this.addMarksOnBoard();
    }
    addMarksOnBoard(){
        if(!this.markElements){
            this.markElements = [];
        }
        const marks = this.model.getCurrentNode().getProperty("marks");
        if(marks && marks.value){
            for(const mark of marks.value){
                //apply rotate180 setting
                const viewX = this.toBoardElementX(mark.pos);
                const viewY = this.toBoardElementY(mark.pos);
                const markColor = this.boardElement.getIntersectionTextColor(
                    viewX, viewY,
                    this.showMoveNumber ? (mark.type == "text" ? "#f31" : "rgba(255, 50, 10, 0.6)") : "#fff",
                    this.showMoveNumber ? (mark.type == "text" ? "#f31" : "rgba(255, 50, 10, 0.6)") : "#000",
                    "#fff");
                const element =
                      mark.type == "text" ? this.boardElement.createText(viewX, viewY, mark.text, markColor) :
                      mark.type == "circle" ? this.boardElement.createCircleMark(viewX, viewY, markColor) :
                      mark.type == "triangle" ? this.boardElement.createTriangleMark(viewX, viewY, markColor) :
                      mark.type == "square" ? this.boardElement.createSquareMark(viewX, viewY, markColor) :
                      mark.type == "cross" ? this.boardElement.createCrossMark(viewX, viewY, markColor) :
                      this.boardElement.createCrossMark(viewX, viewY, markColor);
                if(mark.type == "text"){
                    // before move number
                    this.boardElement.addOverlay(viewX, viewY, element, markColor);
                }
                else{
                    // after move number
                    this.boardElement.addElementOnStone(null, viewX, viewY, element, true);
                }
                this.markElements.push(element);
            }
        }
    }
    removeMarksOnBoard(){
        if(!this.markElements){
            return;
        }
        this.markElements.forEach(elem=>elem.parentNode.removeChild(elem));
        this.markElements.splice(0);
    }


    onIntersectionClick(pos, e){
        if(this.mode){
            if(this.mode.onIntersectionClick){
                this.mode.onIntersectionClick(pos, e);
            }
        }
    }
    onStoneEvent(pos, e){
        if(this.mode){
            if(this.mode.onStoneEvent){
                this.mode.onStoneEvent(pos, e);
            }
        }
    }

    createPassButton(updators){
        const button = createButton("パス", ()=>this.pass());
        updators.push(()=>{button.disabled = this.model.isFinished();});
        return button;
    }
    createResignButton(updators){
        const button = createButton("投了", ()=>this.resign());
        updators.push(()=>{button.disabled = this.model.isFinished();});
        return button;
    }

    move(pos){
        const color = this.model.getTurn();
        this.hideMessage();
        if(this.isAutoTurn()){ // current turn is auto player
            const nexts = this.model.getNextNodes();
            if(nexts.length <= 1){
                return; //一本道
            }
            if(!nexts.find(node=>node.pos == pos)){
                return; //分岐外の手
            }
            this.cancelAutoMove();
        }
        if(!this.editable){
            if(!this.model.getCurrentNode().findNextByMove(pos, color)){
                return; // same move only if not editable
            }
        }
        if(pos == POS_PASS){
            this.model.pass(color);
        }
        else if(pos == POS_RESIGN){
            this.model.resign(color);
        }
        else{
            if(!this.model.putStone(pos, color)){
                this.showMessage("不正な着手です");
            }
        }
        this.update();

        this.scheduleAutoMove();
    }

    putStone(pos){
        this.move(pos);
    }
    pass(){
        this.move(POS_PASS);
    }
    resign(){
        this.move(POS_RESIGN);
    }

    isAutoTurn(){
        return typeof(this.autoMove) == "boolean" ? this.autoMove :
            typeof(this.autoMove) == "number" ? this.model.getTurn() == this.autoMove :
            false;
    }
    scheduleAutoMove(){
        if(this.isAutoTurn() && this.model.getNextNodes().length > 0){
            this.autoMoveTimer = setTimeout(()=>{
                delete this.autoMoveTimer;
                if(this.isAutoTurn()){
                    // rotate lastVisited
                    const node = this.model.getCurrentNode();
                    if(!node.lastVisited || node.nexts.length == 1){
                        node.lastVisited = node.nexts[0];
                    }
                    else if(node.nexts.length >= 2){
                        let index = node.nexts.indexOf(node.lastVisited);
                        if(index >= 0){
                            if(++index >= node.nexts.length){
                                index = 0;
                            }
                            node.lastVisited = node.nexts[index];
                        }
                    }
                    // redo
                    this.model.redo();
                    this.update();
                    this.scheduleAutoMove();
                }
            }, 750);
        }
    }
    cancelAutoMove(){
        if(this.autoMoveTimer !== undefined){
            clearTimeout(this.autoMoveTimer);
            delete this.autoMoveTimer;
        }
    }

    //onAnalyzeButtonClick(){
    //    var cognition = new IgoBoardCognition(this.model);
    //    alert(cognition.toStr());
    //}

    createPreviewStone(){
        class PreviewStone{
            constructor(boardElement){
                this.boardElement = boardElement;
                this.black = boardElement.createStone(0, 0, BLACK).stone;
                this.white = boardElement.createStone(0, 0, WHITE).stone;
                this.black.style.pointerEvents = "none";
                this.white.style.pointerEvents = "none";
                this.black.setAttributeNS(null, "opacity", 0.75);
                this.white.setAttributeNS(null, "opacity", 0.75);
                this.current = null;
            }
            show(color){
                if(!this.current){
                    this.current =
                        color == BLACK ? this.black :
                        color == WHITE ? this.white : null;
                    if(this.current){
                        this.boardElement.stones.appendChild(this.current);
                    }
                }
            }
            setPosition(x, y){
                this.current.setAttributeNS(null, "cx", x);
                this.current.setAttributeNS(null, "cy", y);
            }
            hide(){
                if(this.current){
                    this.current.parentNode.removeChild(this.current);
                    this.current = null;
                }
            }
        }
        const previewStone = this.previewStone = new PreviewStone(this.boardElement);

        function hide(){
            previewStone.hide();
        }
        function controlPreviewStone(e){
            const eventPos = this.boardElement.convertEventPosition(e);
            if(eventPos.x >= 0 && eventPos.y >= 0 &&
               eventPos.x < this.w && eventPos.y < this.h){
                const color =
                      (this.mode && this.mode.getPreviewStoneColor) ?
                          this.mode.getPreviewStoneColor(eventPos.x, eventPos.y) :
                          EMPTY;
                if(color != EMPTY){
                    previewStone.show(color);
                    previewStone.setPosition(eventPos.gridX, eventPos.gridY);
                    return;
                }
            }
            hide();
        }
        function controlPreviewStoneTouch(e){
            if(e.touches.length == 1){
                controlPreviewStone.call(this, e.touches[0]);
            }
            else{
                hide();
            }
        }
        this.boardElement.element.addEventListener("mousemove", e=>controlPreviewStone.call(this, e), false);
        this.boardElement.element.addEventListener("mouseout", hide, false);
        this.boardElement.element.addEventListener("click", hide, false);
        this.boardElement.element.addEventListener("touchmove", e=>controlPreviewStoneTouch.call(this, e), false);
        this.boardElement.element.addEventListener("touchend", hide, false);
        this.boardElement.element.addEventListener("touchcancel", hide, false);
    }

    updateViewArea(){
        const node = this.model.getCurrentNode();
        if(node){
            const points = node.getProperty("VW");
            if(points){
                let minX = this.model.board.w - 1;
                let minY = this.model.board.h - 1;
                let maxX = 0;
                let maxY = 0;
                for(const point of points.value){
                    const x = this.model.board.toX(point);
                    const y = this.model.board.toY(point);
                    if(x < minX){minX = x;}
                    if(y < minY){minY = y;}
                    if(x > maxX){maxX = x;}
                    if(y > maxY){maxY = y;}
                }
                if(minX <= maxX && minY <= maxY){
                    this.boardElement.setViewArea(minX, minY, maxX, maxY);
                }
                else{
                    this.boardElement.clearViewArea();
                }
            }
        }
    }

    // keep board size to fit the window size, parent box
    keepBoardScale(){
        window.addEventListener("resize", e=>this.fitBoardSizeToWindowAndParent(), false);
        this.fitBoardSizeToWindowAndParent();

        if(window.ResizeObserver){
            const resizeObserver = new ResizeObserver(entries =>{
                this.fitBoardSizeToWindowAndParent();
            });
            resizeObserver.observe(this.boardWrapperRow);
        }
    }
    fitBoardSizeToWindowAndParent(){
        if(!this.boardWrapperRow || !this.boardElement){
            return;
        }
        // control-bar height
        const mainUIHeight = [
            this.topBar,
            this.bottomBar
        ].reduce((acc, curr)=>{
            const bcr = curr.getBoundingClientRect();
            const height = bcr.bottom - bcr.top;
            return acc + height;
        }, 0);
        // window size
        const windowW = window.innerWidth;
        const windowH = window.innerHeight;

        // wrapper div width (parent width)
        const wrapperRect = this.boardWrapperRow.getBoundingClientRect();
        const wrapperW = wrapperRect.right-wrapperRect.left;

        // max board size & scale
        const maxBoardW = wrapperW > 10 ? Math.min(windowW, wrapperW) : windowW; //ウィンドウの幅か、包含divの幅
        const maxBoardH = Math.max(windowH/3, windowH-mainUIHeight); //ウィンドウの1/3か、UIの高さを除いた高さ
        const maxBoardSclaeX = maxBoardW / this.boardElement.viewArea.width;
        const maxBoardScaleY = maxBoardH / this.boardElement.viewArea.height;
        const maxBoardScale = Math.min(maxBoardSclaeX, maxBoardScaleY);
        this.maxBoardElementScale = maxBoardScale;

        // element size
        if(maxBoardScale <= 1){
            // 縮小が必要なときは変化の余地無し。
            this.boardElement.setElementScale(maxBoardScale);
        }
        else{
            // 拡大の余地がある場合は、1.0～maxBoardScaleの間。
            const currentScale = this.boardElement.getElementScale();
            this.boardElement.setElementScale(clamp(currentScale, 1.0, maxBoardScale));
        }
    }
    onBarHeightChanged(){
        this.fitBoardSizeToWindowAndParent();
    }


    // Swipe & Pinch Support
    setupSwipePinchOperation(){
        // this.boardElement.elementにaddEventListenerするとフリー編集
        // で石を塗るときにスワイプしてしまう。ハンドラの呼び出し順は
        // addEventListenerの登録順なので、フリー編集モードの起動より
        // どうしても先になってしまう。
        //
        // しかたがないのでboardElementを包み込むdiv(this.boardWrapperBack)
        // を作ってそこでタッチイベントを受け取ることにした。
        //
        // フリー編集モードなどboardElementにaddEventListenerする場所
        // では必要に応じてstopPropagationすること。
        this.boardWrapperBack.addEventListener("touchstart", onTouchStart, false);
        this.boardWrapperBack.addEventListener("touchmove", onTouchMove, false);
        this.boardWrapperBack.addEventListener("touchend", onTouchEnd, false);
        this.boardWrapperBack.addEventListener("touchcancel", onTouchCancel, false);

        const gameView = this;
        const boardElement = this.boardElement;
        let startPos = null;

        function calculateCenterRadius(e){
            if(e.touches.length == 0){
                return null;
            }
            // center of all touches
            const center = Array.prototype.reduce.call(
                e.touches, (acc, curr)=>{
                    acc.x += curr.clientX;
                    acc.y += curr.clientY;
                    return acc;
                }, {x:0, y:0});
            center.x /= e.touches.length;
            center.y /= e.touches.length;
            // mean distance from center
            let radius = Array.prototype.reduce.call(
                e.touches, (acc, curr)=>{
                    const dx = curr.clientX - center.x;
                    const dy = curr.clientY - center.y;
                    acc += Math.sqrt(dx*dx+dy*dy);
                    return acc;
                }, 0) / e.touches.length;
            return {center, radius};
        }

        function resetStartPos(e){
            startPos = calculateCenterRadius(e);
            if(startPos){
                startPos.scroll = {
                    x:boardElement.scrollX,
                    y:boardElement.scrollY};
                startPos.scrollScale = boardElement.getScrollScale();
                startPos.elementScale = boardElement.getElementScale();
                startPos.moved = false;
            }
        }
        function onTouchStart(e){
            // do not prevent default click event
            //e.preventDefault();
            resetStartPos(e);
        }
        function onTouchMove(e){
            const currPos = calculateCenterRadius(e);
            if(startPos && currPos){
                let dr = startPos.radius == 0 ? 1.0 : currPos.radius / startPos.radius;
                let changed = false;

                let newElementScale;
                let newScrollScale;
                const maxElementScale = gameView.maxBoardElementScale;
                if(maxElementScale > 1.0){
                    // 要素を拡大する余地がある場合
                    if(dr >= 1.0){
                        // ピンチアウトの場合はまず要素を拡大し、それが最大まで拡大したら中身を拡大する。
                        newElementScale = clamp(startPos.elementScale * dr, 1.0, maxElementScale);
                        if(newElementScale == startPos.elementScale){
                            dr = dr / (newElementScale / startPos.elementScale);
                            newScrollScale = startPos.scrollScale * dr;
                        }
                        else{
                            newScrollScale = startPos.scrollScale;
                        }
                    }
                    else{
                        // ピンチインの場合はまず中身を縮小し、それが最小まで縮小したら要素を縮小する。
                        newScrollScale = boardElement.clampScrollScale(startPos.scrollScale * dr);
                        if(newScrollScale == startPos.scrollScale){
                            dr = dr / (newScrollScale / startPos.scrollScale);
                            newElementScale = clamp(startPos.elementScale * dr, 1.0, maxElementScale);
                        }
                        else{
                            newElementScale = startPos.elementScale;
                        }
                    }
                }
                else{
                    // 要素を拡大する余地がない場合
                    newElementScale = maxElementScale;
                    newScrollScale = boardElement.clampScrollScale(startPos.scrollScale * dr);
                }

                // apply element scale
                if(newElementScale != boardElement.getElementScale()){
                    boardElement.setElementScale(newElementScale);
                    changed = true;
                }
                // apply scroll scale
                const dx = (currPos.center.x - startPos.center.x) / newElementScale;
                const dy = (currPos.center.y - startPos.center.y) / newElementScale;
                if(boardElement.setScroll(
                    startPos.scroll.x - dx - (startPos.scroll.x + currPos.center.x / newElementScale) * (1 - dr),
                    startPos.scroll.y - dy - (startPos.scroll.y + currPos.center.y / newElementScale) * (1 - dr),
                    newScrollScale)){
                    changed = true;
                }

                if(changed || startPos.moved){
                    startPos.moved = true;
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        }
        function onTouchEnd(e){
            if(startPos && startPos.moved){
                e.preventDefault();
            }
            resetStartPos(e);
        }
        function onTouchCancel(e){
            resetStartPos(e);
        }
    }


    //
    // Game Status
    //
    createGameStatusBar(updators){
        let statusText;
        const div = createElement("div", {"class": "igo-control-bar"}, [
            statusText = document.createTextNode("対局")
        ]);
        updators.push(()=>{
            if(!this.model){
                return;
            }
            const gameStatus = this.model.isFinished() ?
                  "終局 勝者=" + (
                      this.model.getWinner() == BLACK ? "黒" :
                          this.model.getWinner() == WHITE ? "白" : "持碁") :
                  "対局中";

            const boardStatus =
                  "手数=" + String(this.model.getMoveNumber()) + " " +
                  (this.model.getTurn() == BLACK ? "黒番" : "白番") + " " +
                  "アゲハマ " +
                  "黒=" + String(this.model.getPrisoners(BLACK)) +
                  " " +
                  "白=" + String(this.model.getPrisoners(WHITE));

            statusText.data = gameStatus + " " + boardStatus;
        });
        return div;
    }


    //
    // History & Branches
    //

    createUndoAllButton(updators){
        const button = createButton("|<", e=>{
            e.preventDefault();
            this.model.undoAll();
            this.update();
        });
        updators.push(()=>{
            button.disabled = !this.model.getPreviousNode();
        });
        return button;
    }
    createUndoButton(updators){
        const button = createButton("<", e=>{
            e.preventDefault();
            this.model.undo();
            this.update();
        });
        updators.push(()=>{
            button.disabled = !this.model.getPreviousNode();
        });
        return button;
    }
    createRedoButton(updators){
        const button = createButton(">", e=>{
            e.preventDefault();
            if(this.isPreventedRedo()){
                return;
            }
            this.model.redo();
            this.update();
        });
        updators.push(()=>{
            button.disabled = !this.model.getCurrentNode().getNextNodeDefault() || this.isPreventedRedo();
        });
        return button;
    }
    createRedoAllButton(updators){
        const button = createButton(">|", e=>{
            e.preventDefault();
            if(this.isPreventedRedo()){
                return;
            }
            this.model.redoAll();
            this.update();
        });
        updators.push(()=>{
            button.disabled = !this.model.getCurrentNode().getNextNodeDefault() || this.isPreventedRedo();
        });
        return button;
    }
    createVisibilityToggleButton(updators, text, propName, onChange){
        const label = createCheckbox(text, this[propName], e=>{
            if(e.target.checked != this[propName]){
                this[propName] = e.target.checked;
                if(onChange){
                    onChange();
                }
                this.update();
            }
        });
        updators.push(()=>{
            if(this[propName] != label.checkbox.checked){
                label.checkbox.checked = this[propName];
            }
        });
        return label;
    }
    createToggleBranchText(updators){
        return this.createVisibilityToggleButton(updators, "分岐表示", "showBranches");
    }
    createToggleMoveNumber(updators){
        return this.createVisibilityToggleButton(updators, "着手番号", "showMoveNumber", ()=>{
            this.invalidAllIntersections();
        });
    }
    createToggleLastMoveMark(updators){
        return this.createVisibilityToggleButton(updators, "最終着手", "showLastMoveMark");
    }
    createToggleComment(updators){
        return this.createVisibilityToggleButton(updators, "コメント", "showComment");
    }
    createToggleRotate180(updators){
        return this.createVisibilityToggleButton(updators, "180度回転", "rotate180", ()=>{
            this.invalidAllIntersections();
        });
    }

    isPreventedRedo(){
        return this.preventRedoAtBranchPoint &&
            this.model.getNextNodes().length >= 2;
    }

    updateBranchTexts(){
        if(!this.branchTextElements){
            this.branchTextElements = [];
        }
        if(this.branchTextElements.length > 0){
            for(const branchElem of this.branchTextElements){
                branchElem.parentNode.removeChild(branchElem);
            }
            this.branchTextElements.splice(0);
        }

        if( ! this.showBranches || (this.isAutoTurn() && this.model.getNextNodes().length <= 1)){
            return;
        }

        // this.boardElement.overlaysの下にsvgのtext要素を挿入する。
        const fill = this.model.getTurn() == BLACK ? "#444" : "#eee";

        const nexts = this.model.getNextNodes();
        let countOutOfBoard = 0;
        for(let i = 0; i < nexts.length; ++i){
            const node = nexts[i];
            if((node.isPlace() || node.isPass() || node.isResign()) &&
               node.getColor() != this.model.getTurn()){
                continue;
            }
            if(node.isPlace()){
                const text =
                      nexts.length == 1 ? "×" :
                      String.fromCharCode("A".charCodeAt() + i);
                const x = this.toBoardElementX(node.pos);
                const y = this.toBoardElementY(node.pos);
                const branchElem = this.boardElement.createOverlayText(
                    x, y, text, fill,
                    e=>this.onBranchTextClick(node, e),
                    false);
                this.branchTextElements.push(branchElem);
            }
            else{
                const x = 1.5 * countOutOfBoard;
                const y = this.h;
                const text = String.fromCharCode("A".charCodeAt() + i) +
                      (node.pos == POS_PASS ? "パス" :
                       node.pos == POS_RESIGN ? "投了" :
                       node.pos == NPOS ? "盤面" : "不明");
                const branchElem = this.boardElement.createOverlayText(
                    x, y, text, fill,
                    e=>this.onBranchTextClick(node, e),
                    false);
                this.branchTextElements.push(branchElem);
                ++countOutOfBoard;
            }
        }
    }

    onBranchTextClick(node, e){
        if(!this.editable){
            return;
        }
        e.stopPropagation();
        createPopupMenu(e.clientX, e.clientY, [
            {text:"ここに打つ", handler:()=>{
                if(node.pos == NPOS){
                    this.model.redoTo(node);
                    this.update();
                }
                else if(node.pos == POS_PASS){
                    this.pass();
                }
                else if(node.pos == POS_RESIGN){
                    this.resign();
                }
                else{
                    this.putStone(node.pos);
                }
            }},
            {text:"分岐を削除", handler:()=>this.deleteBranch(node)},
            {text:"分岐の順番を前にする", handler:()=>this.changeBranchOrder(node, -1)},
            {text:"分岐の順番を後にする", handler:()=>this.changeBranchOrder(node, 1)},
        ]);
        return;
    }

    deleteBranch(node){
        this.model.getCurrentNode().deleteNext(node);
        this.updateBranchTexts();
    }
    changeBranchOrder(node, delta){
        this.model.getCurrentNode().changeNextOrder(node, delta);
        this.updateBranchTexts();
    }

    backToMove(pos){
        this.model.backToMove(pos);
        this.update();
    }

    setupMouseWheelOperation(){
        const onWheel = (e)=>{
            if(e.deltaY > 0){
                this.model.redo();
                this.update();
            }
            else if(e.deltaY < 0){
                this.model.undo();
                this.update();
            }
        };
        this.boardElement.element.addEventListener("wheel", onWheel, false);
    }

    // SGF

    exportSGF(){
        const now = new Date();
        const filenameDefault = this.filename ? this.filename :
              now.getFullYear() +
              ("0" + (now.getMonth() + 1)).slice(-2) +
              ("0" + now.getDate()).slice(-2) + "_" +
              ("0" + now.getHours()).slice(-2) +
              ("0" + now.getMinutes()).slice(-2) +
              ".sgf";
        const opt = {
            fromCurrentNode:false,
            toCurrentNode:false
        };
        const model = this.model;
        let inputFilename;
        let sgf;
        function update(){
            textarea.value = sgf = model.toSGF(opt);
            textarea.select();
        }
        const {dialog, textarea} = createTextDialog(
            "SGFエクスポート",
            "",
            [
                createElement("div", {}, [
                    createCheckbox("現在の盤面から始まる棋譜を出力", false, e=>{
                        opt.fromCurrentNode = e.target.checked;
                        update();
                    }),
                    createElement("br"),
                    createCheckbox("現在の盤面までの棋譜を出力", false, e=>{
                        opt.toCurrentNode = e.target.checked;
                        update();
                    })
                ])
            ],
            [
                createElement("label", {}, [
                    "ファイル名:",
                    inputFilename = createElement("input", {type:"text", value:filenameDefault}),
                ]),
                createButton("保存", e=>{
                    this.filename = inputFilename.value;
                    saveTextFile(sgf, inputFilename.value);
                }),
                createButton("閉じる", e=>{
                    dialog.close();
                })
            ]
        );
        update();

        function saveTextFile(text, filename){
            const url = URL.createObjectURL(new Blob([text], {type:"text/plain"}));
            const a = document.createElement("a");
            a.innerHTML = "Download File";
            a.download = filename;
            a.href = url;
            a.onclick = e=>{a.parentNode.removeChild(a);};
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url); //when?
        }
    }
    importSGF(){
        const CHAR_ENCODINGS = [
            "UTF-8",
            "Shift_JIS","EUC-JP","ISO-2022-JP","Big5","EUC-KR","GBK","gb18030",
            "IBM866","ISO-8859-2","ISO-8859-3","ISO-8859-4","ISO-8859-5",
            "ISO-8859-6","ISO-8859-7","ISO-8859-8","ISO-8859-8-I","ISO-8859-10",
            "ISO-8859-13","ISO-8859-14","ISO-8859-15","ISO-8859-16",
            "KOI8-R","KOI8-U","macintosh","windows-874","windows-1250",
            "windows-1251","windows-1252","windows-1253","windows-1254",
            "windows-1255","windows-1256","windows-1257","windows-1258",
            "x-mac-cyrillic","UTF-16BE","UTF-16LE",
        ];
        let fileInput, encodingSelect;
        const {dialog, textarea} = createTextDialog(
            [
                createElement("div", {}, "SGFインポート"),
                createElement("div", {}, "SGFをペーストするかファイルを選択/ドロップしてください。")
            ],
            "",
            [
                createElement("div", {class:"igo-control-bar"}, [
                    fileInput = createElement("input", {type:"file"}),
                    createElement("label", {}, [
                        encodingSelect = createElement(
                            "select", {},
                            CHAR_ENCODINGS.map(enc=>createElement("option", {value:enc}, enc)))
                    ])
                ]),
            ],
            ()=>{
                try{
                    const game = Game.fromSGF(textarea.value);
                    this.resetGame(game);
                }
                catch(e){
                    alert("Error: " + e.message);
                }
            });

        // input file
        const gameView = this;
        function loadText(file){
            if(file){
                gameView.filename = file.name;
                const reader = new FileReader();
                reader.onload = ()=>{
                    textarea.value = reader.result;
                    fileInput.value = "";
                };
                reader.readAsText(file, encodingSelect.value);
            }
        }
        fileInput.addEventListener("change", ev=>{
            loadText(fileInput.files[0]);
        }, false);
        textarea.addEventListener("dragenter", ev=>{
            ev.preventDefault();
            ev.stopPropagation();
        }, false);
        textarea.addEventListener("dragover", ev=>{
            ev.preventDefault();
            ev.stopPropagation();
        }, false);
        textarea.addEventListener("drop", ev=>{
            ev.preventDefault();
            ev.stopPropagation();
            loadText(ev.dataTransfer.files[0]);
        }, false);
    }

    openGameInfo(){
        const rootNode = this.model.getRootNode();
        const inputs = {};
        const dialog = createDialogWindow({}, [
            "ゲーム情報",
            createElement("div", {style: "overflow:auto;" + "max-height:" + Math.ceil(Math.max(60, window.innerHeight - 160)) + "px"}, [
                createElement("table", {}, [
                    igo.SGF_GAME_INFO_PROPERTIES.map(propType=>{
                        const propValue = rootNode.hasProperty(propType.id) ? rootNode.getProperty(propType.id).value : "";
                        const input = inputs[propType.id] =
                              propType.type == "text" ? createElement("textarea", {}, propValue) :
                              createElement("input", {type: "text", value:propValue});
                        return createElement("tr", {}, [
                            createElement("td", {style:"white-space:nowrap;"}, propType.desc),
                            createElement("td", {},  input)
                        ]);
                    })
                ])
            ]),
            createElement("div", {"class":"igo-control-bar"}, [
                createButton("OK", e=>{
                    for(const propType of igo.SGF_GAME_INFO_PROPERTIES){
                        const newValue = inputs[propType.id].value;
                        if(newValue){
                            rootNode.addProperty(propType.id, newValue);
                        }
                        else{
                            rootNode.removeProperty(propType.id);
                        }
                    }
                    dialog.close();
                }),
                createButton("Cancel", e=>{
                    dialog.close();
                }),
            ])
        ]);
    }

    openShareDialog(){
        let humanReadable = false;
        let selectedValue = "board";
        let anchor;
        const dialog = createDialogWindow({}, [
            "共有",
            createElement("div", {}, [
                createRadioButtons("size", [
                    {value:"board", text:"現在の盤面を共有", checked:true},
                    {value:"moves", text:"現在までの手順を共有"},
                    {value:"tree", text:"全手順を共有"},
                    {value:"tree-after", text:"現在から後の手順を共有"},
                ], onMethodChanged).map(elem=>createElement("div", {}, elem))
            ]),
            createElement("div", {
                style: "user-select:text; border:1px solid #444; padding:1em; word-break:break-all;"
            }, [
                anchor = createElement("a", {target:"_blank"})
            ]),
            createElement("div", {"class":"igo-control-bar"}, [
                createCheckbox("できるだけ人が読めるようにする", false, e=>{
                    humanReadable = e.target.checked;
                    updateURL();
                })
            ]),
            createElement("div", {"class":"igo-control-bar"}, [
                createButton("Close", e=>{dialog.close();})
            ])
        ]);

        const game = this.model;
        function updateURL(){
            let url;
            switch(selectedValue){
            case "board": url = createBoardQueryURL(game.board, humanReadable); break;
            case "moves": url = createTreeQueryURL(game, {humanReadable, toCurrentNode:true}); break;
            case "tree": url = createTreeQueryURL(game, {humanReadable}); break;
            case "tree-after": url = createTreeQueryURL(game, {humanReadable, fromCurrentNode:true}); break;
            }
            anchor.href = url;
            anchor.innerText = url;
        }
        function onMethodChanged(value){
            selectedValue = value;
            updateURL();
        }
        updateURL();
    }


    // Comment

    createCommentTextArea(updators){
        let textarea;
        let targetNode = null;

        const updateTextAreaDisplay = ()=>{
            // update visibility
            const newDisplay = this.showComment ? "" : "none";
            if(textarea.style.display != newDisplay){
                textarea.style.display = newDisplay;
                this.onBarHeightChanged();
            }
        };
        const updateTextAreaContent = ()=>{
            const newNode = this.model.getCurrentNode();
            const newText = newNode && newNode.hasComment() ? newNode.getComment() : "";

            if(newNode !== targetNode || newText != textarea.value){
                targetNode = newNode;

                if(this.editable){
                    textarea.value = newText;
                }
                else{
                    while(textarea.firstChild){
                        textarea.removeChild(textarea.firstChild);
                    }
                    textarea.appendChild(document.createTextNode(newText));
                }
            }
        };
        const updateCommentPropertyFromTextArea = ()=>{
            if(!this.editable){
                return;
            }
            // reflect comment textarea => property
            if(targetNode){
                const commentNew = textarea.value;
                if(commentNew){
                    if(commentNew != targetNode.getComment()){
                        targetNode.setComment(commentNew);///@todo use model.setCommentToCurrentNode?
                    }
                }
                else{
                    if(targetNode.hasComment()){
                        targetNode.removeComment();
                        updateTextAreaContent();
                    }
                }
            }
        };

        const div = createElement("div", {"class":"igo-comment igo-control-bar"}, [
            textarea =
                this.editable ?
                createElement("textarea", {"class":"igo-comment-textarea"}) :
                createElement("pre", {"class":"igo-comment-pre"})
        ]);

        if(this.editable){
            textarea.addEventListener("change", updateCommentPropertyFromTextArea, false);
        }

        // updator
        updators.push(()=>{
            updateTextAreaDisplay();
            updateCommentPropertyFromTextArea();
            updateTextAreaContent();
        });

        return div;
    }




    //
    // Move Mode
    //
    startMoveMode(){
        const gameView = this;
        class MoveMode{
            constructor(){
                this.alive = false;
            }
            start(){
                if(!this.alive){
                    this.alive = true;
                }
                gameView.scheduleAutoMove();
            }
            end(){
                if(this.alive){
                    this.alive = false;
                }
            }
            onIntersectionClick(pos, e){
                gameView.putStone(pos);
            }
            onStoneEvent(pos, e){
                switch(e.type){
                case "click":
                    e.stopPropagation();
                    if( ! gameView.model.board.isEmpty(pos)){
                        const currNode = gameView.model.getCurrentNode();

                        createPopupMenu(e.clientX, e.clientY, [
                            {text:"この手まで戻る", handler:()=>gameView.backToMove(pos), visible:currNode.pos != pos},
                            {
                                text:currNode.nexts.length > 0 ? "この手以降を削除" : "この手を削除",
                                handler:()=>{
                                    gameView.model.backToMove(pos);
                                    const node = gameView.model.getCurrentNode();
                                    if(node.pos == pos){
                                        gameView.model.undo();
                                    }
                                    gameView.model.getCurrentNode().deleteNext(node);
                                    gameView.update();
                                },
                                visible:currNode.pos == pos
                            }
                        ]);
                    }
                    break;
                case "mousemove":
                    e.stopPropagation(); //prevent preview stone
                    break;
                }
            }
            getPreviewStoneColor(x, y){
                return !gameView.model.isFinished() && gameView.model.board.getAt(gameView.toModelPosition(x, y)) == EMPTY ? gameView.model.getTurn() : EMPTY;
            }
        }
        this.startMode(new MoveMode());
    }

    initUIMap(){
        if(!this.uiMap){
            this.uiMap = {
                "GameStatus": "createGameStatusBar",
                "Menu": "createMenuButton",
                // Move
                "Pass": "createPassButton",
                "Resign": "createResignButton",
                // History
                "UndoAll": "createUndoAllButton",
                "Undo": "createUndoButton",
                "Redo": "createRedoButton",
                "RedoAll": "createRedoAllButton",
                // Visibility
                "ToggleBranchText": "createToggleBranchText",
                "ToggleMoveNumber": "createToggleMoveNumber",
                "ToggleLastMoveMark": "createToggleLastMoveMark",
                "ToggleRotate180": "createToggleRotate180",
                "ToggleComment": "createToggleComment",
                // Comment
                "Comment": "createCommentTextArea",
                // Group
                "MoveControl": ["Menu", "Pass", "Resign"],
                "HistoryControl": ["UndoAll", "Undo", "Redo", "RedoAll"],
                "UndoRedo": ["UndoAll", "Undo", "Redo", "RedoAll"],
                "ViewControl": ["ToggleBranchText", "ToggleMoveNumber", "ToggleLastMoveMark", "ToggleComment", "ToggleRotate180"]
            };
        }
    }
    createUIElement(name, updators){
        this.initUIMap();
        let fun = this.uiMap[name];
        if(typeof(fun) == "string"){
            return this[fun](updators);
        }
        else if(typeof(fun) == "function"){
            return fun(updators);
        }
        else if(fun instanceof Array){
            return this.createUIControlBar(fun, updators);
        }
        else{
            return null;
        }
    }
    createUIControlBar(items, updators){
        if(!items){
            return null;
        }
        return createElement(
            "div", {"class":"igo-control-bar"},
            items.map(item=>{
                if(typeof(item) == "string"){
                    return this.createUIElement(item, updators);
                }
                else if(item instanceof Array){
                    return this.createUIControlBar(item, updators);
                }
                else{
                    return null;
                }
            }));
    }

    initMoveModeUI(){
        const ui = this.opt.ui || {
            top: ["GameStatus"],
            bottom: ["MoveControl", "HistoryControl", "ViewControl", "Comment"]
        };
        const updators = [];
        const top = createElement("div", {}, this.createUIControlBar(ui.top, updators), this.topBar);
        const bottom = createElement("div", {}, this.createUIControlBar(ui.bottom, updators), this.bottomBar);
        this.moveModeUI = {updators, elements:[top, bottom]};
    }
    hideMoveModeUI(){
        for(const element of this.moveModeUI.elements){
            element.style.display = "none";
        }
        this.onBarHeightChanged();
    }
    showMoveModeUI(){
        for(const element of this.moveModeUI.elements){
            element.style.display = "";
        }
        this.onBarHeightChanged();
    }
    updateMoveModeUI(){
        for(const updator of this.moveModeUI.updators){
            updator();
        }
    }


    //
    // Free Edit Mode
    //
    startFreeEditMode(){
        //if(this.model.getMoveNumber() != 0){
        //    alert("フリー編集モードは最初の盤面でのみ使用出来ます。");
        //    return;
        //}

        const gameView = this;
        class FreeEditMode{
            constructor(){
                this.alive = false;
            }
            start(){
                if(!this.alive){
                    this.alive = true;
                    this.color = BLACK;
                    this.drawing = false;
                    this.createController();
                    this.hookEventHandlers();
                    this.alternately = false;
                    gameView.hideMoveModeUI();
                    gameView.boardElement.setStonePointerEventsEnabled(false); //石が盤面上のmouse/touchイベントを邪魔しないようにする
                    //基準となる盤面、手番
                    const currNode = gameView.model.getCurrentNode();
                    this.oldBoard =
                        currNode.isSetup() ?
                        gameView.model.getPreviousBoard() :
                        gameView.model.board.clone();
                }
            }
            end(){
                if(this.alive){
                    this.alive = false;
                    this.unhookEventHandlers();
                    this.controlBar.parentNode.removeChild(this.controlBar);
                    gameView.showMoveModeUI();
                    gameView.boardElement.setStonePointerEventsEnabled(true);

                    // update setup property
                    const boardChanges = BoardChanges.diffBoard(
                        gameView.model.board, this.oldBoard);

                    const currNode = gameView.model.getCurrentNode();

                    if(boardChanges.isEmpty()){
                        if(currNode.getSetup()){
                            currNode.removeSetup();
                            if(currNode.isRemovable() && !currNode.isRoot()){
                                gameView.model.undo();
                                currNode.removeThisNodeOnly();
                                alert("Setup用のノードを削除しました。");
                            }
                        }
                    }
                    else{
                        const boardUndo = BoardChanges.createUndoChanges(
                            boardChanges, this.oldBoard);
                        if( ! currNode.isSetup()){
                            gameView.model.pushSetupNode(
                                boardChanges, boardUndo);
                            alert("Setup用のノードを追加しました。");
                        }
                        else{
                            // Update undo stack and setup property
                            if(currNode.isRoot()){
                                currNode.setSetup(boardChanges);
                            }
                            else{
                                currNode.setSetup(boardChanges);
                                gameView.model.setLastUndo(boardUndo);
                            }
                        }
                    }
                    gameView.update();
                }
            }

            getPreviewStoneColor(x, y){
                return this.color;
            }

            createController(){
                const bar = this.controlBar = createElement("div", {
                    "class":"igo-free-edit igo-control-bar"
                }, [
                    createCheckbox("交互", this.alternately, (e)=>{
                        this.alternately = !this.alternately;
                    }),
                    this.colorSelector = createRadioButtons(
                        "free-edit-color",
                        [
                            {value:BLACK, text:"黒", checked:true},
                            {value:WHITE, text:"白"},
                            {value:EMPTY, text:"空"},
                        ],
                        value=>{
                            const color = parseInt(value);
                            if(color == BLACK || color == WHITE || color == EMPTY){
                                this.color = color;
                            }
                        }),
                    createButton("終了", ()=>{gameView.popMode();}),
                    createCheckbox("白番", gameView.model.getTurn() == WHITE, (e)=>{
                        gameView.model.setTurnForced(e.target.checked ? WHITE : BLACK);
                    })
                ], gameView.bottomBar);
            }

            // Event Handlers

            hookEventHandlers(){
                const eventNames = [
                    "MouseDown", "MouseUp", "MouseMove", "MouseLeave",
                    "TouchStart", "TouchEnd", "TouchMove", "TouchCancel"
                ];
                this.eventHandlers = {};
                for(const ename of eventNames){
                    gameView.boardElement.element.addEventListener(
                        ename.toLowerCase(),
                        this.eventHandlers[ename] = e=>this["on" + ename].call(this, e),
                        false);
                }
            }
            unhookEventHandlers(){
                for(const ename in this.eventHandlers){
                    gameView.boardElement.element.removeEventListener(
                        ename.toLowerCase(),
                        this.eventHandlers[ename],
                        false);
                }
            }

            // Mouse Event

            onMouseDown(e){
                e.stopPropagation();
                e.preventDefault();
                this.startDrawing(e);
            }
            onMouseUp(e){
                e.stopPropagation();
                e.preventDefault();
                if(this.drawing && !this.drawed){ //click
                    this.draw(this.startPos);
                }
                this.endDrawing();
            }
            onMouseLeave(e){
                e.stopPropagation();
                this.endDrawing();
            }
            onMouseMove(e){
                e.stopPropagation();
                e.preventDefault();
                if(this.drawing){
                    this.draw(e);
                }
            }

            // Touch Event

            onTouchStart(e){
                if(e.touches.length == 1){
                    this.startDrawing(e.touches[0]);
                }
                else{
                    this.endDrawing();
                }
            }
            onTouchEnd(e){
                if(e.touches.length == 0 && this.drawing){ //leave last touch && now drawing
                    if(! this.drawed){ // click
                        this.draw(this.startPos);
                    }
                    this.endDrawing();
                    e.preventDefault();//prevent mouse event
                }
            }
            onTouchCancel(e){
                this.endDrawing();
            }
            onTouchMove(e){
                if(e.touches.length == 1 && this.drawing){
                    e.stopPropagation();
                    e.preventDefault();
                    this.draw(e.touches[0]);
                }
            }


            // Drawing
            startDrawing(e){
                if(!this.drawing){
                    this.drawing = true;
                    this.drawed = false;
                    this.startPos = {clientX:e.clientX, clientY:e.clientY};
                }
            }
            endDrawing(){
                if(this.drawing){
                    this.drawing = false;
                    if(this.drawed && this.alternately){
                        const newColor = getOppositeColor(this.color);
                        if(newColor != this.color){
                            this.colorSelector.radio.selectByValue(newColor);
                            this.color = newColor;
                        }
                    }
                }
            }
            draw(e){
                if(this.drawing){
                    this.drawed = true;
                    const eventPos = gameView.boardElement.convertEventPosition(e);
                    const x = eventPos.x;
                    const y = eventPos.y;
                    if(x >= 0 && y >= 0 && x < gameView.boardElement.w && y < gameView.boardElement.h){
                        const pos = gameView.toModelPosition(x, y);
                        gameView.model.board.setAt(pos, this.color);
                        gameView.updateIntersection(pos);
                    }
                }
            }
        }
        this.pushMode(new FreeEditMode(this));
    }


    //
    // Mark Edit Mode
    //
    startMarkEditMode(){
        const gameView = this;
        class MarkEditMode{
            constructor(){
                this.alive = false;
            }
            start(){
                if(!this.alive){
                    this.alive = true;
                    this.type = "cross";
                    this.createController();
                    gameView.hideMoveModeUI();
                    gameView.boardElement.setStonePointerEventsEnabled(false); //石が盤面上のmouse/touchイベントを邪魔しないようにする
                }
            }
            end(){
                if(this.alive){
                    this.alive = false;
                    this.controlBar.parentNode.removeChild(this.controlBar);
                    gameView.showMoveModeUI();
                    gameView.boardElement.setStonePointerEventsEnabled(true);
                }
            }

            createController(){
                const bar = this.controlBar = createElement("div", {
                    "class":"igo-mark-edit igo-control-bar"
                }, [
                    this.colorSelector = createRadioButtons(
                        "mark-edit-type",
                        [
                            {value:"cross", text:"x", checked:true},
                            {value:"circle", text:"\u25cb"},
                            {value:"triangle", text:"\u25b3"},
                            {value:"square", text:"\u25a1"},
                            {value:"text", text:"テキスト"},
                        ],
                        value=>{this.type = value;}),
                    createButton("終了", ()=>{gameView.popMode();})
                ], gameView.bottomBar);
            }

            getMarkAt(pos){
                const marks = gameView.model.getCurrentNode().getProperty("marks");
                if(marks && marks.value){
                    const index = marks.value.findIndex(m=>m.pos == pos);
                    if(index >= 0){
                        const mark = marks.value[index];
                        return {mark, index, marks:marks.value};
                    }
                }
                return null;
            }
            onIntersectionClick(pos, e){
                const currMark = this.getMarkAt(pos);
                if(currMark){
                    createPopupMenu(e.clientX, e.clientY, [
                        {text:"削除", handler:()=>this.deleteMark(pos)}
                    ]);
                }
                else{
                    if(this.type == "text"){
                        const {dialog, textarea} = createTextDialog(
                            "ラベルテキストを入力してください",
                            "",
                            [],
                            ()=>{
                                if(textarea.value){
                                    this.putMark(pos, "text", textarea.value);
                                }
                            });
                    }
                    else{
                        this.putMark(pos, this.type);
                    }
                }
            }
            deleteMark(pos){
                const currMark = this.getMarkAt(pos);
                if(currMark){
                    currMark.marks.splice(currMark.index, 1);
                }
                gameView.updateMarkProperty();
            }
            putMark(pos, type, text){
                const currMark = this.getMarkAt(pos);
                if(!currMark){
                    const marks = gameView.model.getCurrentNode().acquireProperty("marks", []);
                    if(type == "text"){
                        marks.value.push({pos, type, text});
                    }
                    else{
                        marks.value.push({pos, type});
                    }
                }
                gameView.updateMarkProperty();
            }
        }
        this.pushMode(new MarkEditMode(this));
    }
};
igo.GameView = GameView;


//
// Query String
//

function createBoardQueryURL(board, humanReadable){
    const params = new URLSearchParams();
    params.append(
        "board", "" + board.w + (board.w != board.h ? "x" + board.h : "") +
            "_" + (humanReadable ? igo.BoardStringizer.toHumanReadable(board) : igo.BoardStringizer.to20Per32bits(board)));
    if(board.getTurn() == WHITE){
        params.append("turn", "W");
    }
    if(board.koPos != NPOS){
        params.append("ko", igo.toSGFPointXY(
            board.toX(board.koPos),
            board.toX(board.koPos)));
    }
    const blackPrisoners = board.getPrisoners(BLACK);
    const whitePrisoners = board.getPrisoners(WHITE);
    if(blackPrisoners > 0 || whitePrisoners > 0){
        params.append(
            "hama",
            blackPrisoners + "_" + whitePrisoners);
    }
    const url = new URL(document.location.href);
    url.search = params.toString();
    return url.toString();
}

const HUMAN_READABLE_TREE_PREFIX = ".H";
function createTreeQueryURL(game, opt){
    const params = new URLSearchParams();

    const w = game.board.w;
    const h = game.board.h;

    params.append("board", "" + w + (w != h ? "x" + h : ""));
    params.append("tree", opt.humanReadable ?
                  HUMAN_READABLE_TREE_PREFIX + igo.HistoryTreeString.toHumanReadable(game, opt) :
                  igo.HistoryTreeString.toBase64(game, opt));

    // 現在の盤面を開くためのパスを求める。
    if(opt && opt.toCurrentNode){
        // 一本道なので最後のノード
        const depth = game.getCurrentNode().getDepth();
        if(depth > 0){
            params.append("path", depth);
        }
    }
    else if(opt && opt.fromCurrentNode){
        // 最初が現在の盤面なので不要
    }
    else{
        const forks = game.getCurrentNode().getPathFromRoot(true).map(dir=>String.fromCharCode(0x41 + dir));
        if(forks.length > 0){
            forks.reverse();
            params.append("path", forks.join("-"));
        }
    }

    const url = new URL(document.location.href);
    url.search = params.toString();
    return url.toString();
}

function createGameFromQuery(){
    const params = new URLSearchParams(document.location.search.substr(1));
    let w = 9;
    let h = 9;
    let intersections = null;
    let turn = BLACK;
    let ko = null;
    let prisoners = null;
    let tree = null;
    let path = null;

    for(const key of params.keys()){
        const value = params.get(key);
        switch(key){
        case "board":
            {
                // ex:
                // - "9"
                // - "9x9"
                // - "9_xoxoxoxox...........................xoxoxoxox...........................oxoxoxoxo"
                // - "9x9_egZ2cz_jmrOm9LaBw3_StQEAAAAAAAA."
                const matches = /^(\d+)(x(\d+)|)(_(([.ox]+)|([A-Za-z0-9+/_\-]+[=.]*))|)$/.exec(value);
                if(matches){
                    const strW = matches[1];
                    const strH = matches[3];
                    const strHumanReadable = matches[6];
                    const str20Per32bits = matches[7];
                    w = parseInt(strW);
                    h = strH ? parseInt(strH) : w;
                    if(strHumanReadable){
                        intersections = igo.BoardStringizer.fromHumanReadable(strHumanReadable);
                    }
                    else if(str20Per32bits){
                        intersections = igo.BoardStringizer.from20Per32bits(str20Per32bits);
                    }
                }
            }
            break;
        case "turn":
            switch(value){
            case "B": turn = BLACK; break;
            case "W": turn = WHITE; break;
            }
            break;
        case "ko":
            try{ko = igo.parseSGFPointXY(value, 52, 52);}catch(e){}
            break;
        case "hama":
            {
                const matches = /^(\d+)[_, ](\d+)$/.exec(value);
                if(matches){
                    prisoners = [
                        parseInt(matches[1]),
                        parseInt(matches[2])];
                }
            }
            break;
        case "tree":
            tree = value;
            break;
        case "path":
            path = value.split(/ *[,_\- ] */).reduce((acc, curr)=>{
                if(/^[0-9]+$/.test(curr)){
                    acc.push(parseInt(curr));
                }
                else if(/^[A-Za-z]{1,2}$/.test(curr)){
                    acc.push(curr);
                }
                return acc;
            }, []);
            break;
        }
    }

    let game;
    if(tree && new RegExp("^" + HUMAN_READABLE_TREE_PREFIX + "[A-Za-z0-9._\\-]*$").test(tree)){
        game = igo.HistoryTreeString.fromHumanReadable(tree.substring(HUMAN_READABLE_TREE_PREFIX.length), w, h);
    }
    else if(tree && /^[A-Za-z0-9+/_\-]+[=.]*$/.test(tree)){
        game = igo.HistoryTreeString.fromBase64(tree, w, h);
    }
    else{
        game = new Game(w, h);
        if(intersections){
            const setup = game.getRootNode().acquireSetup();
            const size = Math.min(intersections.length, game.board.getIntersectionCount());
            for(let pos = 0; pos < size; ++pos){
                const oldState = game.board.getAt(pos);
                const newState = intersections[pos];
                if(oldState != newState){
                    setup.addIntersectionChange(pos, newState);
                    game.board.setAt(pos, newState);
                }
            }
        }
        if(typeof(turn) == "number"){
            const oldTurn = game.board.getTurn();
            const newTurn = turn;
            if(oldTurn != newTurn){
                const setup = game.getRootNode().acquireSetup();
                setup.setTurnChange(newTurn);
                game.board.setTurn(newTurn);
            }
        }
        if(prisoners){
            game.board.addPrisoners(BLACK, prisoners[0]);
            game.board.addPrisoners(WHITE, prisoners[1]);
        }
        if(ko){
            game.board.setKoPos(game.board.toPosition(ko.x, ko.y));
        }
    }
    if(path){
        game.redoByQuery(path);
    }
    return game;
}
igo.createGameFromQuery = createGameFromQuery;

})();

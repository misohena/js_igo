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
const enumerateBoardChanges = igo.enumerateBoardChanges;
const mergeBoardChanges = igo.mergeBoardChanges;

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

function createDialogWindow(attrs, children, parent){
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
            close();
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
    ], parent);
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
        createElement("div", {"class":"igo-control-bar", style:"text-align:right"},
            onOk ? [
                createButton("OK", ()=>{close(); onOk();}),
                createButton("Cancel", close)
            ] :
            createButton("OK", close)
        )
    ], parent);
    textarea.value = text;

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
    labels.radio = {
        getByValue,
        selectByValue
    };
    return labels;
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

        const rootElement = this.rootElement = this.element = createSVG(
            "svg", {"class": "igo-board"},
            [
                createSVG("rect",{x:0, y:0, width:boardPixelW, height:boardPixelH, fill:"#e3aa4e"}),
                this.defineStoneGradient()
            ]);

        this.elementScale = 1.0; //SVG要素のサイズの縮尺(width=, height=に影響)
        this.scrollScale = 1.0; //表示する内容の縮尺(viewBox=に影響) 1.0 ~
        this.scrollX = 0; // スクロール位置(viewBox=に影響) 0 ~ (this.scrollScale - 1) * this.viewArea.width
        this.scrollY = 0; // スクロール位置(viewBox=に影響) 0 ~ (this.scrollScale - 1) * this.viewArea.height
        this.viewArea = {left:0, top:0, right:boardPixelW, bottom:boardPixelH, width:boardPixelW, height:boardPixelH}; //盤の中の表示する範囲(viewBox=に影響)
        this.updateWidthHeightViewBox();

        const gridRoot = this.gridRoot = createSVG("g", {
            "class":"igo-board-grid-root",
            transform:"translate(" + (gridMargin-0.5) + " " + (gridMargin-0.5) + ")", //adjust pixel coordinates for sharper lines
            style:"pointer-events:none;"
        }, null, rootElement);

        // Grid
        const lineWidth = 1;
        const starRadius = 2;
        const grid = createSVG("g", {"class":"igo-board-grid"}, [
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
            ] : null
        ], gridRoot);

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

            // Intersections
        this.intersections = new Array(w * h);
        for(let pos = 0; pos < this.intersections.length; ++pos){
            this.intersections[pos] = {state:EMPTY, elements:null};
        }

        this.shadows = createSVG("g", {"class":"igo-board-shadows"}, null, gridRoot);
        this.stones = createSVG("g", {"class":"igo-board-stones"}, null, gridRoot);
        this.overlays = createSVG("g", {"class":"igo-board-overlays"}, null, gridRoot);
    }

    // Position

    getIntersectionX(x){return x * this.gridInterval;}
    getIntersectionY(y){return y * this.gridInterval;}

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
        const cx = this.getIntersectionX(x);
        const cy = this.getIntersectionY(y);
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
        for(let pos = 0; pos < this.intersections.length; ++pos){
            const intersection = this.intersections[pos];
            if(intersection.elements && intersection.elements.stone){
                intersection.elements.stone.style.pointerEvents = pointerEvents;
            }
        }
    }
    putStone(x, y, color){
        if(color == BLACK || color == WHITE){
            this.setIntersectionState(x, y, color);
        }
    }
    removeStone(x, y){
        this.setIntersectionState(x, y, EMPTY);
    }
    toPosition(x, y){return x + y * this.w;}
    setIntersectionState(x, y, state){
        if(x >= 0 && x < this.w && y >= 0 && y < this.h){
            const pos = this.toPosition(x, y);
            const intersection = this.intersections[pos];
            if(intersection.state != state){
                if(intersection.elements){
                    const elements = intersection.elements;
                    elements.stone.parentNode.removeChild(elements.stone);
                    elements.shadow.parentNode.removeChild(elements.shadow);
                    intersection.elements = null;
                }
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
    removeAllStones(){
        for(let pos = 0; pos < this.intersections.length; ++pos){
            const intersection = this.intersections[pos];
            if(intersection.elements){
                const elements = intersection.elements;
                elements.stone.parentNode.removeChild(elements.stone);
                elements.shadow.parentNode.removeChild(elements.shadow);
                intersection.elements = null;
            }
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

    createOverlayText(x, y, text, fill, onClick){
        const textX = this.getIntersectionX(x);
        const textY = this.getIntersectionY(y);
        const fontSize = Math.ceil(this.gridInterval*0.70);
        const elem = createSVG("text", {
            x: textX,
            y: textY,
            fill: fill || "#444",
            style: "cursor:pointer;"+
                "font-weight:bold;"+
                "font-size:" + fontSize +";",
            "text-anchor": "middle",
            "alignment-baseline": "middle"}, [text], this.overlays);
        if(onClick){
            elem.style.pointerEvents = "auto";
            elem.addEventListener("click", onClick, false);
            elem.addEventListener("mousemove", (e)=>e.stopPropagation(), false);
        }
        return elem;
    }

    setElementScale(scale){
        this.elementScale = scale;
        this.updateWidthHeightViewBox();
    }
    setScroll(x, y, scale){
        this.scrollScale = Math.max(1.0, scale);
        this.scrollX = x;
        this.scrollY = y;
        this.clampScrollPosition();
        this.updateWidthHeightViewBox();
    }
    clampScrollPosition() {
        // 盤面(viewArea)外が見えないようにスクロール位置を制限する。
        this.scrollX = clamp(this.scrollX, this.getScrollXMin(), this.getScrollXMax());
        this.scrollY = clamp(this.scrollY, this.getScrollYMin(), this.getScrollYMax());
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
    constructor(parent, game, opt){
        // Options
        function toBool(v, defaultValue){
            return v !== undefined ? v : defaultValue;
        }
        this.opt = opt = opt || {};
        this.editable = toBool(opt.editable, true);
        this.showBranches = toBool(opt.showBranchText, false);
        this.rotate180 = toBool(opt.rotate180, false);
        this.preventRedoAtBranchPoint = toBool(opt.preventRedoAtBranchPoint, false);
        this.autoMove = opt.autoMove; //BLACK, WHITE, true, false
        const showUI = toBool(opt.showUI, true);
        this.showComment = toBool(opt.showComment, false);
        this.commentLocation = opt.commentLocation; //TOP, BOTTOM
        this.showMenu = toBool(opt.showMenu, showUI);
        this.showPassResign = toBool(opt.showPassResign, showUI);
        this.showMoveController = this.showMenu || this.showPassResign;
        const showVisibilitySettings = toBool(opt.showVisibilitySettings, showUI);
        this.showCheckboxBranch = toBool(opt.showCheckboxBranch, showVisibilitySettings);
        this.showCheckboxComment = toBool(opt.showCheckboxComment, showVisibilitySettings);
        this.showCheckboxRotate180 = toBool(opt.showCheckboxRotate180, showVisibilitySettings);
        this.showHistoryController = toBool(opt.showHistoryController, showUI || this.showCheckboxBranch || this.showCheckboxComment || this.showCheckboxRotate180);
        this.showGameStatus = toBool(opt.showGameStatus, showUI);

        // Mode
        this.mode = null;
        this.modeStack = [];

        // Root Element
        this.rootElement = createElement("div", {"class":"igo-game"}, [
            // Top Bar
            this.topBar = createElement("div", {"class":"igo-top-bar"}, [
                // Game Status Bar
                this.createGameStatusBar()
            ]),

            // Board Wrapper
            this.boardWrapperRow = createElement("div", {//for board size fitting to parent width
                style: "padding:0; margin:0;"}, [
                    this.boardWrapperBack = createElement("div", {//for swipe & pinch operation
                        style: "padding:0; margin:0; display: inline-block;"
                    })
                ]),

            // Bottom Bar
            this.bottomBar = createElement("div", {"class":"igo-bottom-bar"}, [
            ])
        ], parent);

        // Main UI (Move Mode only?)
        this.createMoveController();
        this.createHistoryController();
        this.createCommentTextArea();

        // Set Game Model
        this.resetGame(game || new Game(9));
    }

    resetGame(game){
        this.model = game;
        const w = this.w = this.model.board.w;
        const h = this.h = this.model.board.h;

        // discard old board
        if(this.boardElement){
            this.boardElement.element.parentNode.removeChild(this.boardElement.element);
            this.boardElement = null;
        }

        // Board
        const boardElement = this.boardElement = new BoardElement(w, h);
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

        this.update();

        this.startMoveMode();
    }

    hideMainUI(){
        if(this.moveController){
            this.moveController.style.display = "none";
        }
        if(this.historyController){
            this.historyController.style.display = "none";
        }
        this.commentTextArea.style.display = "none";
    }
    showMainUI(){
        if(this.moveController){
            this.moveController.style.display = "";
        }
        if(this.historyController){
            this.historyController.style.display = "";
        }
        this.updateCommentTextAreaDisplay();
    }

    onMenuButtonClick(e){
        createPopupMenu(e.clientX, e.clientY, [
            {text:"初期化", handler:()=>this.openResetDialog(), visible:this.editable},
            {text:"SGFインポート", handler:()=>this.importSGF(), visible:this.editable},
            {text:"SGFエクスポート", handler:()=>this.exportSGF()},
            {text:"フリー編集", handler:()=>this.startFreeEditMode(), visible:this.editable}
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
        this.updateStatusText();
        this.updateCommentTextArea();
        this.updateHistoryController();
        this.updateBranchTexts();
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

    updateBoard(){
        this.boardElement.setAllIntersections(
            (x, y)=>((x >= 0 && y >= 0 && x < this.w && y < this.h) ?
                     this.model.board.getAt(this.toModelPosition(x, y)) : EMPTY));
    }

    updateIntersection(pos){
        if(this.model.board.isValidPosition(pos)){
            this.boardElement.setIntersectionState(
                this.toBoardElementX(pos),
                this.toBoardElementY(pos),
                this.model.board.getAt(pos));
        }
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

    createMoveController(){
        if(!this.showMoveController){
            return;
        }
        const moveDiv = this.moveController = createElement(
            "div", {"class": "igo-control-bar"}, [
                this.showMenu ? createButton("メニュー", (e)=>this.onMenuButtonClick(e)) : null,
                this.showPassResign ? createButton("パス", ()=>this.pass()) : null,
                this.showPassResign ? createButton("投了", ()=>this.resign()) : null
                //createButton("分析", ()=>this.onAnalyzeButtonClick())
            ], this.bottomBar);
    }

    move(pos){
        if(this.isAutoTurn()){ // current turn is auto player
            const nexts = this.model.history.getNextNodes();
            if(nexts.length <= 1){
                return; //一本道
            }
            if(!nexts.find(node=>node.pos == pos)){
                return; //分岐外の手
            }
            this.cancelAutoMove();
        }
        if(!this.editable){
            if(!this.model.history.findNextNode(pos)){
                return; // same move only if not editable
            }
        }
        if(pos == POS_PASS){
            this.model.pass();
        }
        else if(pos == POS_RESIGN){
            this.model.resign();
        }
        else{
            if(!this.model.putStone(pos)){
                alert('illegal');
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
        if(this.isAutoTurn() && this.model.history.getNextNodes().length > 0){
            this.autoMoveTimer = setTimeout(()=>{
                delete this.autoMoveTimer;
                if(this.isAutoTurn()){
                    // rotate lastVisited
                    const node = this.model.history.getCurrentNode();
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
        const node = this.model.history.getCurrentNode();
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

        // max board size
        const maxBoardW = wrapperW > 10 ? Math.min(windowW, wrapperW) : windowW; //ウィンドウの幅か、包含divの幅
        const maxBoardH = Math.max(windowH/3, windowH-mainUIHeight); //ウィンドウの1/3か、UIの高さを除いた高さ

        // element size
        const elementScaleX = Math.min(1, maxBoardW / this.boardElement.viewArea.width);
        const elementScaleY = Math.min(1, maxBoardH / this.boardElement.viewArea.height);
        const elementScale = Math.min(elementScaleX, elementScaleY);
        this.boardElement.setElementScale(elementScale);
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
            // inverse element scaling
            center.x = center.x / boardElement.elementScale;
            center.y = center.y / boardElement.elementScale;
            radius = radius / boardElement.elementScale;
            return {
                center,
                radius,
                scroll: {x:boardElement.scrollX, y:boardElement.scrollY},
                scale: boardElement.scrollScale,
                numTouches: e.touches.length,
                moved: false
            };
        }

        function onTouchStart(e){
            // do not prevent default click event
            //e.preventDefault();
            startPos = calculateCenterRadius(e);
        }
        function onTouchMove(e){
            const currPos = calculateCenterRadius(e);
            if(startPos && currPos){
                const dx = currPos.center.x - startPos.center.x;
                const dy = currPos.center.y - startPos.center.y;
                const dr = startPos.radius == 0 ? 1.0 : currPos.radius / startPos.radius;

                boardElement.setScroll(
                    startPos.scroll.x - dx - (startPos.scroll.x + currPos.center.x) * (1 - dr),
                    startPos.scroll.y - dy - (startPos.scroll.y + currPos.center.y) * (1 - dr),
                    startPos.scale * dr);
                startPos.moved = true;
                e.preventDefault();
                e.stopPropagation();
            }
        }
        function onTouchEnd(e){
            if(startPos && startPos.moved){
                e.preventDefault();
            }
            startPos = calculateCenterRadius(e);
        }
        function onTouchCancel(e){
            startPos = calculateCenterRadius(e);
        }
    }


    //
    // Game Status
    //
    createGameStatusBar(){
        if(!this.showGameStatus){
            return null;
        }
        return createElement("div", {"class": "igo-control-bar"}, [
            this.statusText = document.createTextNode("対局")
        ]);
    }

    updateStatusText(){
        if(!this.statusText){
            return;
        }
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

        this.statusText.data = gameStatus + " " + boardStatus;
    }


    //
    // History & Branches
    //

    createHistoryController(){
        if(!this.showHistoryController){
            return null;
        }
        const buttons = this.historyControllerButtons = {};
        return this.historyController = createElement("div", {"class": "igo-control-bar"}, [
            buttons.first = createButton("|<", e=>{
                e.preventDefault();
                this.model.undoAll();
                this.update();
            }),
            buttons.prev = createButton("<", e=>{
                e.preventDefault();
                this.model.undo();
                this.update();
            }),
            buttons.next = createButton(">", e=>{
                e.preventDefault();
                if(this.isPreventedRedo()){
                    return;
                }
                this.model.redo();
                this.update();
            }),
            buttons.last = createButton(">|", e=>{
                e.preventDefault();
                if(this.isPreventedRedo()){
                    return;
                }
                this.model.redoAll();
                this.update();
            }),
            this.showCheckboxBranch ? createCheckbox("分岐表示", this.showBranches, e=>{
                this.showBranches = e.target.checked;
                this.update();
            }) : null,
            this.showCheckboxComment ? createCheckbox("コメント", this.showComment, e=>{
                this.showComment = e.target.checked;
                this.updateCommentTextAreaDisplay();
            }) : null,
            this.showCheckboxRotate180 ? createCheckbox("180度回転", this.rotate180, e=>{
                this.rotate180 = e.target.checked;
                this.update();
            }) : null
        ], this.bottomBar);
    }
    updateHistoryController(){
        if(this.historyControllerButtons){
            const node = this.model.history.getCurrentNode();
            this.historyControllerButtons.first.disabled = !node.prev;
            this.historyControllerButtons.prev.disabled = !node.prev;
            this.historyControllerButtons.next.disabled = !node.lastVisited || this.isPreventedRedo();
            this.historyControllerButtons.last.disabled = !node.lastVisited || this.isPreventedRedo();
        }
    }
    isPreventedRedo(){
        return this.preventRedoAtBranchPoint &&
            this.model.history.getNextNodes().length >= 2;
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

        if( ! this.showBranches || (this.isAutoTurn() && this.model.history.getNextNodes().length <= 1)){
            return;
        }

        // this.boardElement.overlaysの下にsvgのtext要素を挿入する。
        const fill = this.model.getTurn() == BLACK ? "#444" : "#eee";

        const nexts = this.model.history.getNextNodes();
        for(let i = 0; i < nexts.length; ++i){
            const move = nexts[i];
            const text =
                  move.pos == NPOS ? "無着手" :
                  move.pos == POS_PASS ? "パス" :
                  move.pos == POS_RESIGN ? "投了" :
                  nexts.length == 1 ? "×" :
                  String.fromCharCode("A".charCodeAt() + i);
            const x =
                  move.pos == NPOS ? this.w-5 :
                  move.pos == POS_PASS ? this.w-3 :
                  move.pos == POS_RESIGN ? this.w-1 :
                  this.toBoardElementX(move.pos);
            const y =
                  move.pos == NPOS ? this.h :
                  move.pos == POS_PASS ? this.h :
                  move.pos == POS_RESIGN ? this.h :
                  this.toBoardElementY(move.pos);
            const branchElem = this.boardElement.createOverlayText(
                x, y, text, fill,
                e=>this.onBranchTextClick(move.pos, e),
                false);
            this.branchTextElements.push(branchElem);
        }
    }

    onBranchTextClick(pos, e){
        if(!this.editable){
            return;
        }
        e.stopPropagation();
        createPopupMenu(e.clientX, e.clientY, [
            {text:"ここに打つ", handler:()=>{
                if(pos == NPOS){
                    ///@todo
                }
                else if(pos == POS_PASS){
                    this.pass();
                }
                else if(pos == POS_RESIGN){
                    this.resign();
                }
                else{
                    this.putStone(pos);
                }
            }},
            {text:"分岐を削除", handler:()=>this.deleteBranch(pos)},
            {text:"分岐の順番を前にする", handler:()=>this.changeBranchOrder(pos, -1)},
            {text:"分岐の順番を後にする", handler:()=>this.changeBranchOrder(pos, 1)},
        ]);
        return;
    }

    deleteBranch(pos){
        this.model.history.deleteBranch(pos);
        this.updateBranchTexts();
    }
    changeBranchOrder(pos, delta){
        this.model.history.changeBranchOrder(pos, delta);
        this.updateBranchTexts();
    }

    backToMove(pos){
        this.model.backToMove(pos);
        this.update();
    }

    // SGF

    exportSGF(){
        const {dialog, textarea} = createTextDialog(
            "Export SGF",
            this.model.toSGF(),
            createElement("div", {}, [
                createCheckbox("現在の盤面から始まる棋譜を出力", false, e=>{
                    textarea.value = this.model.toSGF(e.target.checked);
                })
            ])
        );
    }
    importSGF(){
        const {dialog, textarea} = createTextDialog(
            "Import SGF",
            "",
            [],
            ()=>{
                const game = Game.fromSGF(textarea.value);
                this.resetGame(game);
            });
    }

    // Comment

    createCommentTextArea(){
        const div = createElement("div", {"class":"igo-comment igo-control-bar"}, [
            this.commentTextArea =
                this.editable ?
                createElement("textarea", {"class":"igo-comment-textarea"}) :
                createElement("pre", {"class":"igo-comment-pre"})
        ], this.commentLocation == "TOP" ? this.topBar : this.bottomBar);

        if(this.editable){
            this.commentTextArea.addEventListener("change", (e)=>this.onCommentTextAreaChange(e), false);
        }
        this.commentTextAreaTarget = null;
        this.updateCommentTextAreaDisplay();
        return div;
    }

    updateCommentTextAreaDisplay(){
        const newDisplay = this.showComment ? "" : "none";
        if(this.commentTextArea.style.display != newDisplay){
            this.commentTextArea.style.display = newDisplay;
            this.onBarHeightChanged();
        }
    }

    updateCommentTextArea(){
        if(this.commentTextArea){
            this.updateCommentPropertyFromTextArea();

            const node = this.model.history.getCurrentNode();
            let newText = "";
            if(node){
                this.commentTextAreaTarget = node;
                newText = node.hasComment() ? node.getComment() : "";
            }
            else{
                this.commentTextAreaTarget = null;
                newText = "";
            }
            if(this.editable){
                this.commentTextArea.value = newText;
            }
            else{
                this.commentTextArea.innerHTML = newText;
            }
        }
    }
    onCommentTextAreaChange(e){
        this.updateCommentPropertyFromTextArea();
    }
    updateCommentPropertyFromTextArea(){
        if(!this.editable){
            return;
        }
        // reflect comment textarea => property
        if(this.commentTextAreaTarget){
            const commentNew = this.commentTextArea.value;
            if(commentNew){
                if(commentNew != this.commentTextAreaTarget.getComment()){
                    this.commentTextAreaTarget.setComment(commentNew);///@todo use model.setCommentToCurrentNode?
                }
            }
            else{
                if(this.commentTextAreaTarget.hasComment()){
                    this.commentTextAreaTarget.removeComment();
                    this.updateCommentTextArea();
                }
            }
        }
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
                        createPopupMenu(e.clientX, e.clientY, [
                            {text:"この手まで戻る", handler:()=>gameView.backToMove(pos)}
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

    //
    // Free Edit Mode
    //
    startFreeEditMode(){
        if(this.model.getMoveNumber() != 0){
            alert("フリー編集モードは最初の盤面でのみ使用出来ます。");
            return;
        }

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
                    gameView.hideMainUI();
                    gameView.boardElement.setStonePointerEventsEnabled(false); //石が盤面上のmouse/touchイベントを邪魔しないようにする
                    this.oldBoard = gameView.model.board.clone(); //開始時点の盤面
                }
            }
            end(){
                if(this.alive){
                    this.alive = false;
                    this.unhookEventHandlers();
                    this.controlBar.parentNode.removeChild(this.controlBar);
                    gameView.showMainUI();
                    gameView.boardElement.setStonePointerEventsEnabled(true);

                    // update setup property
                    const newChanges = enumerateBoardChanges(this.oldBoard, gameView.model.board); //diffBoard
                    const currNode = gameView.model.history.getCurrentNode();
                    const oldSetup = currNode.getSetup();
                    const mergedChanges = (oldSetup && oldSetup.intersections) ? mergeBoardChanges(oldSetup.intersections, newChanges) : newChanges;
                    currNode.setSetup(mergedChanges);
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
                    createCheckbox("白先", gameView.model.getFirstTurn() == WHITE, (e)=>{
                        gameView.model.setFirstTurn(e.target.checked ? WHITE : BLACK);
                    })
                ], gameView.bottomBar);
            }

            // Event Handlers

            hookEventHandlers(){
                const eventNames = [
                    "Click",
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

            onClick(e){
                if(!this.drawing){
                    this.paint(e);
                }
            }

            onMouseDown(e){
                e.stopPropagation();
                e.preventDefault();
                this.startDrawing();
            }
            onMouseUp(e){
                e.stopPropagation();
                e.preventDefault();
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
                    this.paint(e);
                }
            }

            // Touch Event

            onTouchStart(e){
                if(e.touches.length == 1){
                    this.startDrawing();
                }
                else{
                    this.endDrawing();
                }
            }
            onTouchEnd(e){
                if(e.touches.length != 1){
                    this.endDrawing();
                }
            }
            onTouchCancel(e){
                this.endDrawing();
            }
            onTouchMove(e){
                if(e.touches.length == 1 && this.drawing){
                    e.stopPropagation();
                    e.preventDefault();
                    this.paint(e.touches[0]);
                }
            }


            // Drawing
            startDrawing(){
                if(!this.drawing){
                    this.drawing = true;
                }
            }
            endDrawing(){
                if(this.drawing){
                    this.drawing = false;
                    if(this.alternately){
                        const newColor = getOppositeColor(this.color);
                        if(newColor != this.color){
                            this.colorSelector.radio.selectByValue(newColor);
                            this.color = newColor;
                        }
                    }
                }
            }
            paint(e){
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
        this.pushMode(new FreeEditMode(this));
    }
};
igo.GameView = GameView;

})();

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
    attrs["class"] += " dialog-window";
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
    document.body.addEventListener("click", onOutsideClick, true);
    document.body.addEventListener("mousemove", onOutsideEvent, true);
    document.body.addEventListener("mousedown", onOutsideEvent, true);
    document.body.addEventListener("mouseup", onOutsideEvent, true);

    function close(){
        parent.removeChild(dialog);
        document.body.removeEventListener("click", onOutsideClick, true);
        document.body.removeEventListener("mousemove", onOutsideEvent, true);
        document.body.removeEventListener("mousedown", onOutsideEvent, true);
        document.body.removeEventListener("mouseup", onOutsideEvent, true);
    }

    dialog.close = close;
    return dialog;
}

function createPopupMenu(x, y, items, parent){
    const ITEM_BG_NORMAL = "";
    const ITEM_BG_HOVER = "rgba(200, 200, 200, 1.0)";
    const ITEM_COLOR_DISABLED = "#888";

    const menuDiv = createDialogWindow({"class":"popup-menu"}, [
        items.map(item=>{
            if(item.invisible){
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

function createTextDialog(message, text, onOk, parent){
    let textarea;
    const dialog = createDialogWindow({}, [
        createElement("div", {}, message),
        textarea = createElement("textarea", {
            style: "display:block;"+
                   "margin: auto;"+
                   "max-width:100%;"+
                   "width:40em;"+
                   "height:4em;"}),
        createElement("div", {"class":"control-bar", style:"text-align:right"},
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

        const rootElement = this.rootElement = this.element = createSVG(
            "svg",
            {
                "class": "board",
                width: gridMargin*2+gridInterval*(w-1),
                height: gridMargin*2+gridInterval*(h-1)
            },
            [
                createSVG("rect",{width:"100%", height:"100%", fill:"#e3aa4e"}),
                this.defineStoneGradient()
            ]);

        const gridRoot = this.gridRoot = createSVG("g", {
            "class":"board-grid-root",
            transform:"translate(" + (gridMargin-0.5) + " " + (gridMargin-0.5) + ")", //adjust pixel coordinates for sharper lines
            style:"pointer-events:none;"
        }, null, rootElement);

        // Grid
        const lineWidth = 1;
        const starRadius = 2;
        const grid = createSVG("g", {"class":"board-grid"}, [
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

        this.shadows = createSVG("g", {"class":"board-shadows"}, null, gridRoot);
        this.stones = createSVG("g", {"class":"board-stones"}, null, gridRoot);
        this.overlays = createSVG("g", {"class":"board-overlays"}, null, gridRoot);
    }

    // Position

    getIntersectionX(x){return x * this.gridInterval;}
    getIntersectionY(y){return y * this.gridInterval;}

    convertEventPosition(event){
        const bcr = this.rootElement.getBoundingClientRect();
        // coordinates for this.rootElement
        const rootX = event.clientX - bcr.left;
        const rootY = event.clientY - bcr.top;
        // coordinates for this.gridRoot, this.shadows, this.stones, this.overlays
        const gridX = rootX - this.gridMargin;
        const gridY = rootY - this.gridMargin;
        // coordinates for board model
        const x = Math.floor(gridX / this.gridInterval + 0.5);
        const y = Math.floor(gridY / this.gridInterval + 0.5);
        return {rootX, rootY, gridX, gridY, x, y};
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
            intersection.state = EMPTY;
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
}
igo.BoardElement = BoardElement;


//
// GameView
//

class GameView{
    constructor(parent, game, opt){
        this.opt = opt = opt || {};
        this.parent = parent = parent || document.body;

        this.showBranches = false;
        this.rotate180 = false;

        this.resetGame(game || new Game(9));
    }

    resetGame(game){
        this.model = game;
        const w = this.w = this.model.board.w;
        const h = this.h = this.model.board.h;

        this.mode = null;

        // Recreate Root Element
        if(this.rootElement){
            this.rootElement.parentNode.removeChild(this.rootElement);
            this.rootElement = null;
        }
        const rootElement = this.rootElement = createElement(
            "div", {}, [], this.parent);

        // Game Status Bar
        this.createGameStatusBar(); //set this.statusText

        // Board
        const boardElement = this.boardElement = new BoardElement(w, h);
        rootElement.appendChild(boardElement.element);

        boardElement.onIntersectionClick = (x, y, e)=>{
            this.onIntersectionClick(this.toModelPosition(x, y), e);
        };

        boardElement.onStoneEvent = (x, y, e)=>{
            this.onStoneEvent(this.toModelPosition(x, y), e);
        };

        this.createPreviewStone();

        // Move Controller
        this.createMoveController();

        // History Controller
        this.createHistoryController();
        this.createCommentTextArea();

        this.update();

        this.startMoveMode();
    }

    hideMainUI(){
        this.moveController.style.display = "none";
        this.historyController.style.display = "none";
    }
    showMainUI(){
        this.moveController.style.display = "";
        this.historyController.style.display = "";
    }

    onMenuButtonClick(e){
        createPopupMenu(e.clientX, e.clientY, [
            {text:"初期化", handler:()=>this.openResetDialog()},
            {text:"SGFインポート", handler:()=>this.importSGF()},
            {text:"SGFエクスポート", handler:()=>this.exportSGF()},
            {text:"コメント設定", handler:()=>this.setCommentToCurrentMove()},
            {text:"フリー編集", handler:()=>this.startFreeEditMode()}
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
            createElement("div", {"class":"control-bar"}, [
                createElement("button", {type:"submit"}, "Ok"),
                buttonCancel = createElement("button", {type:"button"}, "Cancel"),
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
    }
    endMode(){
        if(this.mode){
            this.mode.end();
            this.mode = null;
        }
    }
    pushMode(mode){
        if(!this.modeStack){
            this.modeStack = [];
        }
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
        const moveDiv = this.moveController = createElement(
            "div", {"class": "control-bar"}, [
                createButton("メニュー", (e)=>this.onMenuButtonClick(e)),
                createButton("パス", ()=>this.pass()),
                createButton("投了", ()=>this.resign())
                //createButton("分析", ()=>this.onAnalyzeButtonClick())
            ], this.rootElement);
    }

    putStone(pos){
        if(this.model.putStone(pos)){
            this.update();
        }
        else{
            alert('illegal');
        }
    }
    pass(){
        this.model.pass();
        this.update();
    }
    resign(){
        this.model.resign();
        this.update();
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


    //
    // Game Status
    //
    createGameStatusBar(parent){
        const statusDiv = createElement("div", {"class": "control-bar"}, [
            this.statusText = document.createTextNode("")
        ], this.rootElement);
    }

    updateStatusText(){
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
        const historyDiv = this.historyController = createElement("div", {"class": "control-bar"}, [], this.rootElement);
        const first = createButton("|<", ()=>{
            this.model.undoAll();
            this.update();
        }, historyDiv);
        const prev = createButton("<", ()=>{
            this.model.undo();
            this.update();
        }, historyDiv);
        const next = createButton(">", ()=>{
            this.model.redo();
            this.update();
        }, historyDiv);
        const last = createButton(">|", ()=>{
            this.model.redoAll();
            this.update();
        }, historyDiv);
        this.historyControllerButtons = {first, prev, next, last};

        createCheckbox("分岐表示", this.showBranches, (e)=>{
            this.showBranches = e.target.checked;
            this.update();
        }, historyDiv);
        createCheckbox("180度回転", this.rotate180, (e)=>{
            this.rotate180 = e.target.checked;
            this.update();
        }, historyDiv);
    }
    updateHistoryController(){
        const move = this.model.history.getCurrentMove();
        this.historyControllerButtons.first.disabled = !move.prev;
        this.historyControllerButtons.prev.disabled = !move.prev;
        this.historyControllerButtons.next.disabled = !move.lastVisited;
        this.historyControllerButtons.last.disabled = !move.lastVisited;
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

        if( ! this.showBranches){
            return;
        }

        // this.boardElement.overlaysの下にsvgのtext要素を挿入する。
        const fill = this.model.getTurn() == BLACK ? "#444" : "#eee";

        const nexts = this.model.history.getNextMoves();
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
        createTextDialog(
            "Export SGF",
            this.model.toSGF());
    }
    importSGF(){
        const dialog = createTextDialog(
            "Import SGF",
            "",
            ()=>{
                const game = Game.fromSGF(dialog.textarea.value);
                this.resetGame(game);
            });
    }

    // Comment

    createCommentTextArea(){
        const div = createElement("div", {"class":"comment control-bar"}, [], this.rootElement);
        const textarea = this.commentTextArea = createElement("textarea", {}, [], div);
        textarea.addEventListener("change", (e)=>this.onCommentTextAreaChange(e), false);
        this.commentTextAreaTarget = null;
    }

    updateCommentTextArea(){
        if(this.commentTextArea){
            this.updateCommentPropertyFromTextArea();

            const move = this.model.history.getCurrentMove();
            if(move && move.hasOwnProperty("comment")){
                this.commentTextAreaTarget = move;
                this.commentTextArea.value = move.comment;
                this.commentTextArea.style.display = "";
            }
            else{
                this.commentTextAreaTarget = null;
                this.commentTextArea.value = "";
                this.commentTextArea.style.display = "none";
            }
        }
    }
    onCommentTextAreaChange(e){
        this.updateCommentPropertyFromTextArea();
    }
    updateCommentPropertyFromTextArea(){
        // reflect comment textarea => property
        if(this.commentTextAreaTarget){
            const commentNew = this.commentTextArea.value;
            if(commentNew){
                if(commentNew != this.commentTextAreaTarget.comment){
                    this.commentTextAreaTarget.comment = commentNew;///@todo use setCommentToCurrentMove?
                }
            }
            else{
                if(this.commentTextAreaTarget.hasOwnProperty("comment")){
                    delete this.commentTextAreaTarget.comment;
                    this.updateCommentTextArea();
                }
            }
        }
    }

    setCommentToCurrentMove(){
        this.model.setCommentToCurrentMove("");
        this.updateCommentTextArea();
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
                }
            }
            end(){
                if(this.alive){
                    this.alive = false;
                    this.unhookEventHandlers();
                    this.controlBar.parentNode.removeChild(this.controlBar);
                    gameView.showMainUI();
                    gameView.boardElement.setStonePointerEventsEnabled(true);
                }
            }

            getPreviewStoneColor(x, y){
                return this.color;
            }

            createController(){
                const bar = this.controlBar = createElement("div", {
                    "class":"free-edit control-bar"
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
                ], gameView.rootElement);
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

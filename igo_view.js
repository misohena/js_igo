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

//
// HTML UI Utilities
//

function createSVG(elemName, attrs, parent){
    const elem = document.createElementNS("http://www.w3.org/2000/svg", elemName);
    for(const attr in attrs){
        elem.setAttributeNS(null, attr, attrs[attr]);
    }
    if(parent){
        parent.appendChild(elem);
    }
    return elem;
}

function createElement(elemName, attrs, parent){
    const elem = document.createElement(elemName);
    for(const attr in attrs){
        elem.setAttribute(attr, attrs[attr]);
    }
    if(parent){
        parent.appendChild(elem);
    }
    return elem;
}

function createDialogWindow(parent){
    parent = parent || document.body;
    const dialog = createElement("div", {
        style: "user-select:none;"+
            "border: 1px solid black;"+
            "background-color:rgba(250, 250, 250, 0.8);"+
            "position:fixed;"+
            "left:4.5%;"+
            "top:1em;"+
            "box-sizing: border-box;"+
            "max-width:90%;"+
            "padding:1em 1em;"
    }, parent);

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

function createPopupMenu(items, parent, x, y){
    const menuDiv = createDialogWindow(parent);
    menuDiv.style.padding = "4px 1px";

    const ITEM_BG_NORMAL = "";
    const ITEM_BG_HOVER = "rgba(200, 200, 200, 1.0)";
    for(const item of items){
        const itemDiv = createElement("div", {
            style: "padding:4px 1em"}, menuDiv);
        itemDiv.appendChild(document.createTextNode(item.text));
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
    }

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

function createTextDialog(parent, message, text, onOk){
    const dialog = createDialogWindow(parent);

    const messageDiv = createElement("div", {}, dialog);
    messageDiv.appendChild(document.createTextNode(message));

    const textarea = createElement("textarea", {
        style: "display:block;"+
            "margin: auto;"+
            "max-width:100%;"+
            "width:40em;"+
            "height:4em;"}, dialog);
    textarea.value = text;

    const buttonDiv = createElement("div", {
        "class": "control-bar",
        style: "text-align:right"}, dialog);
    if(onOk){
        createButton(buttonDiv, "OK", ()=>{close(); onOk();});
        createButton(buttonDiv, "Cancel", close);
    }
    else{
        createButton(buttonDiv, "OK", close);
    }

    function close(){
        dialog.close();
    }
    return {dialog, textarea};
}

function createButton(parent, value, onClick){
    const button = createElement("input", {
        type: "button",
        value: value}, parent);
    button.addEventListener('click', onClick, false);
    return button;
}

function createCheckbox(parent, text, checked, onChange){
    const label = createElement("label", {}, parent);
    const checkbox = createElement("input", {
        type: "checkbox"}, label);
    checkbox.checked = checked;
    checkbox.addEventListener('change', onChange, false);
    label.appendChild(document.createTextNode(text));
    return label;
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

        const gridInterval = this.gridInterval = opt.gridInterval || 32;
        const gridMargin = this.gridMargin = opt.gridMargin || 50;

        const rootElement = this.rootElement = this.element = createSVG("svg", {"class":"board", width:gridMargin*2+gridInterval*(w-1), height:gridMargin*2+gridInterval*(h-1)});
        createSVG("rect", {width:"100%", height:"100%", fill:"#e3aa4e"}, rootElement);
        this.defineStoneGradient(rootElement);

        const gridRoot = this.gridRoot = createSVG("g", {
            "class":"board-grid-root",
            transform:"translate(" + (gridMargin-0.5) + " " + (gridMargin-0.5) + ")", //adjust pixel coordinates for sharper lines
            style:"pointer-events:none;"
        }, rootElement);

        // Grid
        const grid = createSVG("g", {"class":"board-grid"}, gridRoot);

            // Lines
        const lineWidth = 1;
        for(let x = 0; x < w; ++x){
            const lineX = gridInterval * x;
            createSVG("line", {x1:lineX, y1:-lineWidth/2, x2:lineX, y2:gridInterval*(h-1)+lineWidth/2, stroke:"black", "stroke-width":lineWidth}, grid);
        }
        for(let y = 0; y < h; ++y){
            const lineY = gridInterval * y;
            createSVG("line", {y1:lineY, x1:-lineWidth/2, y2:lineY, x2:gridInterval*(w-1)+lineWidth/2, stroke:"black", "stroke-width":lineWidth}, grid);
        }

            // Stars
        const starRadius = 2;
        if(w&1 && h&1){
            createSVG("circle", {cx:gridInterval*((w-1)/2), cy:gridInterval*((h-1)/2), r:starRadius}, grid);
        }
        if(w>=13 && h>=13){
            createSVG("circle", {cx:gridInterval*3, cy:gridInterval*3, r:starRadius}, grid);
            createSVG("circle", {cx:gridInterval*(w-4), cy:gridInterval*3, r:starRadius}, grid);
            createSVG("circle", {cx:gridInterval*3, cy:gridInterval*(h-4), r:starRadius}, grid);
            createSVG("circle", {cx:gridInterval*(w-4), cy:gridInterval*(h-4), r:starRadius}, grid);
        }

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

        this.shadows = createSVG("g", {"class":"board-shadows"}, gridRoot);
        this.stones = createSVG("g", {"class":"board-stones"}, gridRoot);
        this.overlays = createSVG("g", {"class":"board-overlays"}, gridRoot);
    }

    defineStoneGradient(svg){
        const defs = createSVG("defs", {}, svg);
        const black = createSVG("radialGradient", {
            id:"stone-black", cx:0.5, cy:0.5, fx:0.7, fy:0.3, r:0.55}, defs);
        createSVG("stop", {offset:"0%", "stop-color":"#606060"},black);
        createSVG("stop", {offset:"100%", "stop-color":"#000000"},black);

        const white = createSVG("radialGradient", {
            id:"stone-white", cx:0.5, cy:0.5, fx:0.7, fy:0.3, r:0.6}, defs);
        createSVG("stop", {offset:"0%", "stop-color":"#ffffff"},white);
        createSVG("stop", {offset:"80%", "stop-color":"#e0e0e0"},white);
        createSVG("stop", {offset:"100%", "stop-color":"#b0b0b0"},white);
    }

    getIntersectionX(x){return x * this.gridInterval;}
    getIntersectionY(y){return y * this.gridInterval;}

    convertEventPosition(event){
        const bcr = this.rootElement.getBoundingClientRect();
        // coordinates for this.rootElement
        const rootX = event.clientX - bcr.left;
        const rootY = event.clientY - bcr.top;
        // coordinates for this.shadows, this.stones, this.overlays
        const gridX = rootX - this.gridMargin;
        const gridY = rootY - this.gridMargin;
        // coordinates for board model
        const x = Math.floor(gridX / this.gridInterval + 0.5);
        const y = Math.floor(gridY / this.gridInterval + 0.5);
        return {rootX, rootY, gridX, gridY, x, y};
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

        return {stone, shadow};
    }
    createStoneOnIntersection(x, y, color){
        const elements = this.createStone(x, y, color);
        elements.stone.style.pointerEvents = "auto";
        elements.stone.addEventListener("mousemove", e=>e.stopPropagation(), false);
        elements.stone.addEventListener("click", e=>{
            if(this.onStoneClick){
                this.onStoneClick(x, y, e);
            }
        }, false);
        return elements;
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
    setByBoard(board, rotate180){
        for(let y = 0; y < board.h; ++y){
            for(let x = 0; x < board.w; ++x){
                this.setIntersectionState(
                    x, y,
                    board.getAt(board.toPosition(
                        rotate180 ? board.w - 1 - x : x,
                        rotate180 ? board.h - 1 - y : y)));
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
            "alignment-baseline": "middle"}, this.overlays);
        elem.appendChild(document.createTextNode(text));
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

        // Recreate Root Element
        if(this.rootElement){
            this.rootElement.parentNode.removeChild(this.rootElement);
            this.rootElement = null;
        }
        const rootElement = this.rootElement = document.createElement("div");
        this.parent.appendChild(rootElement);

        // Game Status Bar
        this.createGameStatusBar(); //set this.statusText

        // Board
        const boardElement = this.boardElement = new BoardElement(w, h);
        rootElement.appendChild(boardElement.element);

        boardElement.onIntersectionClick = (x, y, e)=>{
            this.onIntersectionClick(this.toBoardPosition(x, y), e);
        };

        boardElement.onStoneClick = (x, y, e)=>{
            this.onStoneClick(this.toBoardPosition(x, y), e);
        };

            // Preview Stone
        const self = this;
        const previewStoneBlack = boardElement.createStone(0, 0, BLACK).stone;
        const previewStoneWhite = boardElement.createStone(0, 0, WHITE).stone;
        let currentPreviewStone = null;
        previewStoneBlack.setAttributeNS(null, "opacity", 0.75);
        previewStoneWhite.setAttributeNS(null, "opacity", 0.75);
        function showPreviewStone(){
            if(!currentPreviewStone){
                currentPreviewStone = game.getTurn() == BLACK ? previewStoneBlack : previewStoneWhite;
                boardElement.stones.appendChild(currentPreviewStone);
            }
        }
        function hidePreviewStone(){
            if(currentPreviewStone){
                currentPreviewStone.parentNode.removeChild(currentPreviewStone);
                currentPreviewStone = null;
            }
        }
        function controlPreviewStone(e){
            const eventPos = boardElement.convertEventPosition(e);
            if(!game.isFinished() &&
               eventPos.x >= 0 && eventPos.y >= 0 &&
               eventPos.x < w && eventPos.y < h &&
               game.board.getAt(self.toBoardPosition(eventPos.x, eventPos.y)) == EMPTY){

                showPreviewStone();
                currentPreviewStone.setAttributeNS(null, "cx", eventPos.gridX);
                currentPreviewStone.setAttributeNS(null, "cy", eventPos.gridY);
            }
            else{
                hidePreviewStone();
            }
        }
        boardElement.element.addEventListener("mousemove", controlPreviewStone, false);
        boardElement.element.addEventListener("mouseout", hidePreviewStone, false);
        boardElement.element.addEventListener("click", controlPreviewStone, false);

        // Move Controller
        const moveDiv = createElement("div", {"class": "control-bar"}, rootElement);
        createButton(moveDiv, "メニュー", (e)=>this.onMenuButtonClick(e));
        createButton(moveDiv, "パス", ()=>this.onPassButtonClick());
        createButton(moveDiv, "投了", ()=>this.onResignButtonClick());
        //createButton(moveDiv, "分析", ()=>this.onAnalyzeButtonClick());

        // History Controller
        this.createHistoryController();
        this.createCommentTextArea();

        this.update();
    }

    onMenuButtonClick(e){
        createPopupMenu([
            {text:"初期化", handler:()=>this.openResetDialog()},
            {text:"SGFインポート", handler:()=>this.importSGF()},
            {text:"SGFエクスポート", handler:()=>this.exportSGF()},
            {text:"コメント設定", handler:()=>this.setCommentToCurrentMove()}
        ], document.body, e.clientX, e.clientY);
    }

    openResetDialog(){
        const dialog = createDialogWindow(document.body);

        const currentW = this.model.board.w;
        const currentH = this.model.board.h;

        dialog.innerHTML = `
<form>
  <div>
    <div><label><input type="radio" name="size" value="9" />9 x 9</label></div>
    <div><label><input type="radio" name="size" value="13" />13 x 13</label></div>
    <div><label><input type="radio" name="size" value="19" />19 x 19</label></div>
    <div class="custom"><label><input type="radio" name="size" value="custom" checked/>Custom</label>
      <input type="number" name="custom-w" min="1" max="52" value="${currentW}" /> x
      <input type="number" name="custom-h" min="1" max="52" value="${currentH}" />
    </div>
  </div>
  <div class="control-bar">
    <button type="submit">Ok</button>
    <button type="button" class="button-cancel">Cancel</button>
  </div>
</form>`;
        const form = dialog.querySelector("form");

        form.addEventListener("submit", (e)=>{
            e.preventDefault();
            const data = new FormData(form);
            const size = data.get("size");
            const w = parseInt((size=="custom") ? data.get("custom-w") : size);
            const h = parseInt((size=="custom") ? data.get("custom-h") : size);

            this.resetGame(new Game(w, h));
            dialog.close();
        }, false);

        const buttonCancel = dialog.querySelector(".button-cancel");
        buttonCancel.addEventListener("click", (e)=>{
            dialog.close();
        });

        const checkboxes = dialog.querySelectorAll('input[type="radio"]');
        checkboxes.forEach(elem=>elem.addEventListener("change", updateCustomDisabled), false);

        const checkboxCustom = dialog.querySelector('input[value="custom"]');
        function updateCustomDisabled(){
            dialog.querySelectorAll('.custom > input[type="number"]').forEach(elem=>{
                elem.disabled = ! checkboxCustom.checked;
            });
        }
    }

    toBoardPosition(x, y){
        return this.model.board.toPosition(
            this.rotate180 ? this.model.board.w - 1 - x : x,
            this.rotate180 ? this.model.board.h - 1 - y : y);
    }
    toBoardX(pos){
        const x = this.model.board.toX(pos);
        return this.rotate180 ? this.model.board.w - 1 - x : x;
    }
    toBoardY(pos){
        const y = this.model.board.toY(pos);
        return this.rotate180 ? this.model.board.h - 1 - y : y;
    }

    //
    // Update Contents
    //

    update(){
        this.updateBoard();
        this.updateStatusText();
        this.updateCommentTextArea();
        this.updateBranchTexts();
    }


    //
    // Board Control
    //

    updateBoard(){
        this.boardElement.setByBoard(this.model.board, this.rotate180);
    }

    onIntersectionClick(pos, e){this.putStone(pos);}
    onPassButtonClick(){this.pass();}
    onResignButtonClick(){this.resign();}

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

    onStoneClick(pos, e){
        e.stopPropagation();
        if(!this.model.board.isEmpty(pos)){
            createPopupMenu([
                {text:"この手まで戻る", handler:()=>this.backToMove(pos)}
            ], document.body, e.clientX, e.clientY);
        }
    }


    //
    // Game Status
    //
    createGameStatusBar(parent){
        const statusDiv = createElement("div", {"class": "control-bar"}, this.rootElement);
        const statusText = this.statusText = document.createTextNode("");
        statusDiv.appendChild(statusText);
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
        const historyDiv = createElement("div", {"class": "control-bar"}, this.rootElement);
        createButton(historyDiv, "|<", ()=>{
            this.model.undoAll();
            this.update();
        });
        createButton(historyDiv, "<", ()=>{
            this.model.undo();
            this.update();
        });
        createButton(historyDiv, ">", ()=>{
            this.model.redo();
            this.update();
        });
        createButton(historyDiv, ">|", ()=>{
            this.model.redoAll();
            this.update();
        });
        /* moved to main menu
        createButton(historyDiv, "export", ()=>{
            this.exportSGF();
        });
        createButton(historyDiv, "import", ()=>{
            this.importSGF();
        });
        */
        createCheckbox(historyDiv, "分岐表示", this.showBranches, (e)=>{
            this.showBranches = e.target.checked;
            this.update();
        });
        createCheckbox(historyDiv, "180度回転", this.rotate180, (e)=>{
            this.rotate180 = e.target.checked;
            this.update();
        });
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
                  this.toBoardX(move.pos);
            const y =
                  move.pos == NPOS ? this.h :
                  move.pos == POS_PASS ? this.h :
                  move.pos == POS_RESIGN ? this.h :
                  this.toBoardY(move.pos);
            const branchElem = this.boardElement.createOverlayText(
                x, y, text, fill,
                e=>this.onBranchTextClick(move.pos, e),
                false);
            this.branchTextElements.push(branchElem);
        }
    }

    onBranchTextClick(pos, e){
        e.stopPropagation();
        createPopupMenu([
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
        ], document.body, e.clientX, e.clientY);
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
            document.body,
            "Export SGF",
            this.model.toSGF());
    }
    importSGF(){
        const dialog = createTextDialog(
            document.body,
            "Import SGF",
            "",
            ()=>{
                const game = Game.fromSGF(dialog.textarea.value);
                this.resetGame(game);
            });
    }

    // Comment

    createCommentTextArea(){
        const div = createElement("div", {"class":"comment control-bar"}, this.rootElement);
        const textarea = this.commentTextArea = createElement("textarea", {}, div);
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
};
igo.GameView = GameView;

})();

"use strict";

(function(){
const igo = window.igo = window.igo || {};

const EMPTY = igo.EMPTY = 0;
const BLACK = igo.BLACK = 1;
const WHITE = igo.WHITE = 2;
const NPOS = igo.NPOS = -1; //invalid position
const POS_RESIGN = igo.POS_RESIGN = -2; // use history & game only. do not use board

//
// Color
//

function isValidColor(color)
    {return color == BLACK || color == WHITE;}
function getOppositeColor(color)
    {return color == BLACK ? WHITE : color == WHITE ? BLACK : color;}
function getColorIndex(color)
    {return color == BLACK ? 0 : color == WHITE ? 1 : -1;}
igo.isValidColor = isValidColor;
igo.getOppositeColor = getOppositeColor;
igo.getColorIndex = getColorIndex;

//
// 2-bits array
//
// number of dwords in each size:
// - ceil(9*9*2/32) = 6
// - ceil(13*13*2/32) = 11
// - ceil(19*19*2/32) = 23

const Array2Bits = {
    create: function(w, h){
        return new Uint32Array(((w * h << 1) + 31) >> 5); //2-bits per intersection (ceil(w*h*2/32))
    },
    clone: function(bits){
        return bits.slice();
    },
    get: function(bits, pos){
        const bitpos = pos << 1;
        return (bits[bitpos >> 5] >>> (bitpos & 31)) & 3;
    },
    set: function(bits, pos, state){
        const bitpos = pos << 1;
        const arrayIndex = bitpos >> 5;
        const bitIndex = bitpos & 31;
        bits[arrayIndex] = bits[arrayIndex]
            & ~(3 << bitIndex)
            | ((state & 3) << bitIndex);
    }
};

//
// Board Model
//

class Board{
    constructor(w, h, intersections, prisoners, koPos, turn){
        this.w = typeof(w) == "number" ? w : 19;
        this.h = typeof(h) == "number" ? h : this.w;
        this.intersections = intersections || Array2Bits.create(this.w, this.h);
        this.prisoners = prisoners || [0, 0];
        this.koPos = typeof(koPos) == "number" ? koPos : NPOS;
        this.turn = typeof(turn) == "number" ? turn : BLACK;
    }

    // Clone

    clone(){
        return new Board(this.w, this.h, Array2Bits.clone(this.intersections), this.prisoners.slice(), this.koPos, this.turn);
    }

    // Intersections

    getIntersectionCount()
        {return this.w * this.h;}
    getAt(pos)
        {return Array2Bits.get(this.intersections, pos);}
    setAt(pos, state)
        {Array2Bits.set(this.intersections, pos, state);}
    isEmpty(pos)
        {return pos != NPOS && this.getAt(pos) == EMPTY;}
    removeStone(pos)
        {this.setAt(pos, EMPTY);}

    // Position(index of intersections)

    toPosition(x, y)
        {return x + y * this.w;}
    toX(pos)
        {return pos % this.w;}
    toY(pos)
        {return pos / this.w | 0;}
    isValidPosition(pos)
        {return pos != NPOS && pos >= 0 && pos < this.w * this.h;}
    leftOf(pos)
        {return pos == NPOS || (pos % this.w) == 0 ? NPOS : pos - 1;}
    rightOf(pos)
        {return pos == NPOS || (pos % this.w) == (this.w - 1) ? NPOS : pos + 1;}
    above(pos)
        {return pos == NPOS || pos < this.w ? NPOS : pos - this.w;}
    below(pos)
        {return pos == NPOS || pos >= this.w * (this.h - 1) ? NPOS : pos + this.w;}

    forEachDirection(pos, func){
        func.apply(this, [this.leftOf(pos)]);
        func.apply(this, [this.rightOf(pos)]);
        func.apply(this, [this.above(pos)]);
        func.apply(this, [this.below(pos)]);
    }

    // Turn

    getTurn()
        {return this.turn;}
    setTurn(color)
        {this.turn = color;}
    rotateTurn()
        {this.turn = getOppositeColor(this.turn);}

    // Prisoners

    addPrisoners(prisonerColor, numPrisoners){
        const colorIndex = getColorIndex(prisonerColor);
        if(colorIndex >= 0){
            this.prisoners[colorIndex] += numPrisoners;
        }
    }
    removePrisoners(prisonerColor, numPrisoners){
        const colorIndex = getColorIndex(prisonerColor);
        if(colorIndex >= 0){
            this.prisoners[colorIndex] -= numPrisoners;
        }
    }
    getPrisoners(prisonerColor){
        const colorIndex = getColorIndex(prisonerColor);
        return colorIndex >= 0 ? this.prisoners[colorIndex] : 0;
    }

    // Move

    pass(history){
        const koPosOld = this.koPos;
        this.koPos = NPOS;

        if(history){
            history.push(NPOS, null, koPosOld, this.koPos);
        }
        this.rotateTurn();
    }

    putStone(pos, color, history){
        if( ! this.isMoveLegal(pos, color)){
            return false;
        }
        this.setAt(pos, color);

        const removedStonesArray = history ? [] : null;
        const removedStonesCount
              = this.removeStringIfSurrounded(this.leftOf(pos), color, removedStonesArray)
              + this.removeStringIfSurrounded(this.above(pos), color, removedStonesArray)
              + this.removeStringIfSurrounded(this.rightOf(pos), color, removedStonesArray)
              + this.removeStringIfSurrounded(this.below(pos), color, removedStonesArray);

        this.addPrisoners(getOppositeColor(color), removedStonesCount);

        const koPosOld = this.koPos;
        this.koPos = this.getNewKoPosition(pos, color, removedStonesCount);

        if(history){
            history.push(pos, removedStonesArray, koPosOld, this.koPos);
        }
        this.rotateTurn();
        return true;
    }

    isMoveLegal(pos, color){
        if( ! isValidColor(color)){
            return false; //colorが有効な色ではない
        }
        if( ! this.isValidPosition(pos)){
            return false; //盤外
        }
        if(this.getTurn() != color){
            return false; //手番じゃない
        }
        if( ! this.isEmpty(pos)){
            return false; //すでに石がある
        }
        if(this.isMoveSuicide(pos, color)){
            return false; //自殺手はダメ
        }
        if(this.isMoveKo(pos)){
            return false; //コウによる着手禁止点
        }
        ///@todo 必要なら同型反復(スーパーコウ)の禁止
        return true;
    }
    isMoveSuicide(pos, color){
        //事前条件: pos != NPOS && isEmpty(pos) && (color == WHITE || color == BLACK)
        // 高速化のための前判定をする。
        // 上下左右に空点があるなら自殺手には絶対ならない。
        if(this.isEmpty(this.leftOf(pos)) ||
           this.isEmpty(this.rightOf(pos)) ||
           this.isEmpty(this.above(pos)) ||
           this.isEmpty(this.below(pos))){
            return false;
        }

        //仮においてみる。
        const prevColor = this.getAt(pos);
        this.setAt(pos, color);

        let suicide = false;
        if(!this.isStringSurrounded(pos)){
            // 置いた石が他の石で囲まれていない場合はOK
            suicide = false;
        }
        else{
            // 囲まれている場合は、他の石をとれるならOK(石を取れるルールの場合)
            if(this.isStringSurroundedAndDiffColor(this.leftOf(pos), color) ||
               this.isStringSurroundedAndDiffColor(this.above(pos), color) ||
               this.isStringSurroundedAndDiffColor(this.rightOf(pos), color) ||
               this.isStringSurroundedAndDiffColor(this.below(pos), color)){
                suicide = false;
            }
            // 囲まれていて他の石をとれないならダメ
            else{
                suicide = true; //自殺手だ！
            }
        }

        // 仮に置いた石を取り除く
        this.setAt(pos, prevColor);

        return suicide;
    }
    isMoveKo(pos){
        return pos == this.koPos;
    }


    /**
     * 連が囲まれている(ダメが0個)の場合trueを返します。
     */
    isStringSurrounded(pos){
        return !this.findLiberty(pos);
    }

    /**
     * 連が囲まれている(ダメが0個)、かつ、色が指定されたのものと一致する場合
     * trueを返します。それ以外の場合falseを返します。
     * 指定された位置が盤外である場合や石がない場合はfalseを返します。
     */
    isStringSurroundedAndDiffColor(pos, color){
        if(pos == NPOS){
            return false; //盤外。
        }
        const posColor = this.getAt(pos);
        if(posColor == EMPTY){
            return false; //石がない。
        }
        if(posColor == color){
            return false; //指定された色と同じ。
        }
        return this.isStringSurrounded(pos);
    }


    /**
     * 指定した石を構成要素とする連にダメがあるかどうかを調べます。
     * ダメがあるならtrueを返し、無いならfalseを返します。
     */
    findLiberty(pos){
        if(pos == NPOS){
            return false;
        }
        const posColor = this.getAt(pos);
        if(posColor == EMPTY){
            return true;
        }
        const visited = new Array(this.w * this.h);
        return this.findLibertyRecursive(pos, posColor, visited);
    }
    findLibertyRecursive(pos, color, visited){
        if(pos == NPOS){
            return false; //盤外。辺に当たった
        }
        if(visited[pos]){
            return false; //すでに調べた。他で調べたので見つからなかったことに
        }
        visited[pos] = true;

        const intersection = this.getAt(pos);
        if(intersection == EMPTY){
            return true; //ここで空点を見つけた
        }
        if(intersection != color){
            return false; //別の色の石に当たった
        }
        if(this.findLibertyRecursive(this.leftOf(pos), color, visited) ||
           this.findLibertyRecursive(this.above(pos), color, visited) ||
           this.findLibertyRecursive(this.rightOf(pos), color, visited) ||
           this.findLibertyRecursive(this.below(pos), color, visited)){
            return true; //上下左右のいずれかで見つけた
        }
        return false; //見つからなかった
    }



    /**
     * 囲まれた連を取り除きます。
     * 指定された位置の石につながっている一群の石(連)が完全に囲まれているとき、
     * その一群の石をすべて取り除きます。
     *
     * 取り除いた石の数だけアゲハマを増やします。
     *
     * @param pos 石の位置です。
     * @param turn 取り除く原因になった手番です。posにある石の色がturnと同じ場合は取り除きません。
     * @return 取り除いた石の数を返します。
     */
    removeStringIfSurrounded(pos, turn, arr){
        if(pos == NPOS){
            return 0; //盤外。
        }
        const color = this.getAt(pos);
        if(color == EMPTY){
            return 0; //石がない。
        }
        if(color == turn){
            return 0; //味方の石。
        }
        if( ! this.isStringSurrounded(pos)){
            return 0; //囲まれていない。
        }
        return this.removeString(pos, color, arr);
    }

    /**
     * 指定した石を構成要素とする連を盤上から取り除きます。
     * 取り除いた石の数を返します。
     */
    removeString(pos, color, arr){
        if(pos == NPOS){
            return 0; //盤外。
        }
        if(this.getAt(pos) != color){
            return 0; //色が変わった。
        }

        this.removeStone(pos);
        if(arr){
            arr.push(pos);
        }

        return 1
            + this.removeString(this.leftOf(pos), color, arr)
            + this.removeString(this.above(pos), color, arr)
            + this.removeString(this.rightOf(pos), color, arr)
            + this.removeString(this.below(pos), color, arr);
    }


    // Ko

    setKoPos(pos){
        this.koPos = pos;
    }

    /**
     * コウによる着手禁止点を求めます。
     * putStone()内から呼び出されます。
     * posにcolorの石を置いて、石をremovedStonesだけ取り上げた段階で
     * 呼び出されます。
     */
    getNewKoPosition(pos, color, removedStonesCount){
        if(pos == NPOS || color == EMPTY){
            return NPOS; //posやcolorが無効。
        }
        if(removedStonesCount != 1){
            return NPOS; //取った石が一つではないならコウは発生しない。
        }
        if(this.getAt(pos) != color){
            return NPOS; //posにcolorの石が無い。通常あり得ない。
        }

        //上下左右の空点または自分の石の数を数える。
        let numEmptyOrSameColor = 0;
        let posEmptyOrSameColor = NPOS;

        this.forEachDirection(pos, (neighborPos) => {
            if(neighborPos != NPOS){
                const neighborColor = this.getAt(neighborPos);
                if(neighborColor == EMPTY || neighborColor == color){
                    ++numEmptyOrSameColor;
                    posEmptyOrSameColor = neighborPos;
                }
            }
        });

        if(numEmptyOrSameColor == 1){
            // 空点または自色の石は一つだけ。
            // この関数は1子取ったことが前提なので、空点は必ず1つ以上あるはず。
            // 1つしかないということはその1つが取った1子の場所でその他が相手色または盤外。
            // その空点に相手が打つと一手前に戻るので、その空点が着手禁止点。
            return posEmptyOrSameColor;
        }
        else{
            return NPOS;
        }
    }
}
igo.Board = Board;


//
// History
//

class HistoryUtil {
    static undoBoard(move, board){
        // move {pos, removedStones, koPosOld, koPosNew}
        const oppositeColor = board.getTurn();
        const color = getOppositeColor(oppositeColor);
        if(move.pos != NPOS){
            board.removeStone(move.pos);
        }
        if(move.removedStones){
            for(const pos of move.removedStones){
                board.setAt(pos, oppositeColor);
            }
            board.removePrisoners(oppositeColor, move.removedStones.length);
        }
        board.setKoPos(move.koPosOld);
        board.setTurn(color);
    }
    static redoBoard(move, board){
        // move {pos, removedStones, koPosOld, koPosNew}
        const color = board.getTurn();
        if(move.pos != NPOS){
            board.setAt(move.pos, color);
        }
        if(move.removedStones){
            for(const pos of move.removedStones){
                board.removeStone(pos);
            }
            board.addPrisoners(getOppositeColor(color), move.removedStones.length);
        }
        board.setKoPos(move.koPosNew);
        board.setTurn(getOppositeColor(color));
    }
}

class HistoryTree{
    constructor(){
        this.moveNumber = 0;
        this.pointer = this.first = {prev:null, nexts:[], lastVisited:null};
    }
    getMoveNumber(){return this.moveNumber;}
    getCurrentMove(){return this.pointer;}
    getNextMoves(){return this.pointer.nexts;}
    getPreviousMove(){return this.pointer.prev;}
    getFirstMoves(){return this.first.nexts;}

    push(pos, removedStones, koPosOld, koPosNew){
        const moveSamePos = this.pointer.nexts.find(move=>move.pos == pos);
        if(moveSamePos){
            this.pointer.lastVisited = moveSamePos;
            this.pointer = moveSamePos;
        }
        else{
            const newMove = {prev:this.pointer, nexts:[], lastVisited:null, pos, removedStones, koPosOld, koPosNew};
            this.pointer.nexts.push(newMove);
            this.pointer.lastVisited = newMove;
            this.pointer = newMove;
        }
        if(pos != POS_RESIGN){
            ++this.moveNumber;
        }
    }
    undo(board, game){
        if( ! this.pointer.prev){
            return false;
        }
        const move = this.pointer;
        if(move.pos == POS_RESIGN){
            game.cancelFinish();
        }
        else{
            if(this.pointer.pos == NPOS && this.pointer.prev.pos == NPOS){
                game.cancelFinish();
            }
            HistoryUtil.undoBoard(move, board);
            --this.moveNumber;
        }
        this.pointer = this.pointer.prev;
        return true;
    }
    redo(board, game){
        if( ! this.pointer.lastVisited){
            return false;
        }
        const move = this.pointer.lastVisited;
        if(move.pos == POS_RESIGN){
            game.setFinished(getOppositeColor(board.getTurn()));
        }
        else{
            if(this.pointer.pos == NPOS && this.pointer.lastVisited.pos == NPOS){
                game.setFinished(EMPTY); ///@todo 勝敗判定！
            }
            HistoryUtil.redoBoard(move, board);
            ++this.moveNumber;
        }
        this.pointer = this.pointer.lastVisited;
        return true;
    }
    backToMove(pos, board, game){
        while(this.pointer.pos != pos && this.pointer.prev){
            this.undo(board, game);
        }
    }
    undoAll(board, game){
        while(this.undo(board, game));
    }
    redoAll(board, game){
        while(this.redo(board, game));
    }

    // Tree Operations

    deleteBranch(pos){
        const index = this.pointer.nexts.findIndex(move=>move.pos == pos);
        if(index >= 0){
            const move = this.pointer.nexts[index];
            this.pointer.nexts.splice(index, 1);
            // lastVisitedが指している手が削除されたときの対応
            if(this.pointer.lastVisited === move){
                ///@todo [0]にしてしまっていい？　いっそnullの方がいい？
                this.pointer.lastVisited = this.pointer.nexts.length == 0
                    ? null : this.pointer.nexts[0];
            }
        }
    }
    changeBranchOrder(pos, delta){
        const index = this.pointer.nexts.findIndex(move=>move.pos == pos);
        if(index >= 0){
            const move = this.pointer.nexts[index];
            this.pointer.nexts.splice(index, 1);
            const newIndex = Math.min(Math.max(index + delta, 0), this.pointer.nexts.length);
            this.pointer.nexts.splice(newIndex, 0, move);
        }
    }

    visitAllMoves(enter, leave){
        const stack = [];
        let curr = {node:this.first, children:this.first.nexts, childIndex:0};
        for(;;){
            if(curr.childIndex < curr.children.length){
                const child = curr.children[curr.childIndex];
                enter(child, curr.childIndex, curr.children.length, stack.length);

                stack.push(curr);
                curr = {node:child, children:child.nexts, childIndex:0};
            }
            else{
                if(stack.length <= 0){
                    break;
                }
                const parent = stack.pop();
                leave(curr.node, parent.childIndex, parent.children.length, stack.length);
                curr = parent;
                ++curr.childIndex;
            }
        }
    }
}
igo.HistoryTree = HistoryTree;



//
// Game Model
//

class Game{
    constructor(w, h){
        this.finished = false;
        this.winner = EMPTY;
        this.board = new Board(w, h);
//        this.history = new History();
        this.history = new HistoryTree();
    }

    // Finished & Winner

    isFinished(){return this.finished;}
    getWinner(){return this.winner;}
    setFinished(winner){
        this.finished = true;
        this.winner = winner;//BLACK, WHITE or EMPTY (draw)
    }
    cancelFinish(){
        this.finished = false;
        this.winner = EMPTY;
    }

    // Board
    getTurn(){return this.board.getTurn();}
    getPrisoners(color){return this.board.getPrisoners(color);}

    pass(){
        if( ! this.finished){
            const prevMoveIsPass = this.history.getCurrentMove().pos == NPOS;
            this.board.pass(this.history);

            if(prevMoveIsPass){
                this.setFinished(EMPTY); ///@todo 勝敗の判定！
            }
        }
    }
    putStone(pos){
        if( ! this.finished){
            return this.board.putStone(pos, this.board.getTurn(), this.history);
        }
        else{
            return false;
        }
    }
    resign(){
        if( ! this.finished){
            this.setFinished(getOppositeColor(this.getTurn()));
            this.history.push(POS_RESIGN, null, this.board.koPos, this.board.koPos); //keep koPos, do not rotate a turn
        }
    }

    // History

    getMoveNumber(){return this.history.getMoveNumber();}

    undo(){this.history.undo(this.board, this);}
    redo(){this.history.redo(this.board, this);}
    undoAll(){this.history.undoAll(this.board, this);}
    redoAll(){this.history.redoAll(this.board, this);}
    backToMove(pos){this.history.backToMove(pos, this.board, this);}


    // SGF

    toSGF(){
        function toLetter(n){
            if(n >= 0 && n <= 25){
                return String.fromCharCode(0x61 + n); //a~z
            }
            else if(n >= 26 && n <= 51){
                return String.fromCharCode(0x41 - 26 + n); //A~Z
            }
            else{
                throw new Error("SGF coordinates out of range : " + n);
            }
        }

        let str = "";
        this.history.visitAllMoves(
            (move,indexSiblings,numSiblings,level)=>{ //enter
                if(move.pos == POS_RESIGN){
                    return; //ignore resign
                }
                if(numSiblings > 1){
                    str += "(";
                }
                str += ";" +
                    (level&1 ? "W" : "B") +
                    "[" +
                    (move.pos == NPOS ? "" :
                     toLetter(this.board.toX(move.pos)) +
                     toLetter(this.board.toY(move.pos))) +
                    "]";
            },
            (move,indexSiblings,numSiblings,level)=>{ //leave
                if(move.pos == POS_RESIGN){
                    return; //ignore resign
                }
                if(numSiblings > 1){
                    str += ")";
                }
            },
        );
        return "(;GM[1]" +
            "SZ[" + (this.board.w == this.board.h ? this.board.w : this.board.w + ":" + this.board.h) + "]" +
            str + ")";
    }

    static fromSGF(str){
        const collection = parseSGF(str);
        const rootTree = collection[0];

        // Parse root node
        const rootNode = rootTree.nodes[0];
        let boardSize;
        for(let i = 0; i < rootNode.length; ++i){
            const property = rootNode[i];
            switch(property.propIdent){
            case "GM":
                if(property.propValues[0] != "1"){
                    throw new Error("Unsupported SGF : Not GM[1]");
                }
                break;
            case "SZ":
                boardSize = property.propValues[0].split(":").map(s=>{
                    const n = parseInt(s);
                    if(!(n >= 1 && n <= 52)){
                        throw new Error("Invalid board size " + n);
                    }
                    return n;
                });
                break;
            }
        }

        // Create Game object
        if( ! boardSize){
            throw new Error("Unspecified board size");
        }
        const w = boardSize[0];
        const h = boardSize.length >= 2 ? boardSize[1] : w;
        const game = new Game(w, h);

        // represent all moves & create history tree
        processTree(rootTree, 1);
        return game;

        function fromLetter(charCode){
            if(charCode >= 0x61 && charCode <= 0x7a){
                return charCode - 0x61;
            }
            else if(charCode >= 0x41 && charCode <= 0x5a){
                return charCode - 0x41 + 26;
            }
            else{
                throw new Error("SGF coordinates out of range :" + String.fromCharCode(charCode));
            }
        }
        function processTree(tree, startIndex){
            // put moves
            for(let ni = startIndex; ni < tree.nodes.length; ++ni){
                const nodeProps = tree.nodes[ni];
                for(const prop of nodeProps){
                    const pid = prop.propIdent;
                    const pvalues = prop.propValues;
                    if(pid == "B" || pid == "W"){
                        const point = pvalues[0];
                        if(point == "" || (point == "tt" && boardSize <= 19)){
                            game.pass();
                        }
                        else{
                            const x = fromLetter(point.charCodeAt(0));
                            const y = fromLetter(point.charCodeAt(1));
                            if(!game.putStone(game.board.toPosition(x, y))){
                                throw new Error("SGF includes a illegal move at " + point);
                            }
                        }
                    }
                }
            }

            // represent branches
            for(let bi = 0; bi < tree.subtrees.length; ++bi){
                const branchTree = tree.subtrees[bi];
                processTree(branchTree, 0);
            }

            // undo moves
            for(let ni = startIndex; ni < tree.nodes.length; ++ni){
                game.undo();
            }
        }
    }
}
igo.Game = Game;




// https://www.red-bean.com/sgf/sgf4.html
//
//  Collection = GameTree+
//  GameTree   = "(" Sequence GameTree* ")"
//  Sequence   = Node+
//  Node       = ";" Property*
//  Property   = PropIdent PropValue+
//  PropIdent  = UcLetter+
//  PropValue  = "[" CValueType "]"
//  CValueType = (ValueType | Compose)
//  ValueType  = (None | Number | Real | Double | Color | SimpleText |
//                Text | Point  | Move | Stone)
//
function parseSGF(sgf){
    let i = 0;
    return parseCollection();

    function error(msg){throw new Error("SGF Syntax Error at " + i + " : " + (msg || ""));}
    function scan(){return i<sgf.length ? sgf.charAt(i) : null;}
    function get(){return i<sgf.length ? sgf.charAt(i++) : null;}
    function discard(){if(i<sgf.length) ++i;}
    function isWS(c){return c==" " || c=="\t" || c=="\n" || c=="\r";}
    function skipWS(){while(isWS(scan())) discard();}
    function match(s){
        skipWS();
        if(sgf.substring(i, Math.min(sgf.length, i+s.length)) != s){
            error("expected " + s);
        }
        i += s.length;
    }
    function getIf(pred){
        const begin = i;
        while(i < sgf.length && pred(sgf.charAt(i))){
            ++i;
        }
        return sgf.substring(begin, i);
    }

    function parseCollection(){
        const gameTrees = parseGameTreeList();
        if(gameTrees.length == 0){
            error("Collection must have GameTree.");
        }
        return gameTrees;
    }
    function parseGameTreeList(){
        const gameTrees = [];
        while(skipWS(), scan() == "("){
            gameTrees.push(parseGameTree());
        }
        return gameTrees;
    }
    function parseGameTree(){
        match("(");
        const nodes = parseSequence();
        const subtrees = parseGameTreeList();
        match(")");
        return {nodes, subtrees};
    }
    function parseSequence(){//NodeList
        const nodes = [];
        while(skipWS(), scan() == ";"){
            nodes.push(parseNode());
        }
        return nodes;
    }
    function parseNode(){
        match(";");
        const properties = [];
        let prop;
        while((prop = parsePropertyOpt())){
            properties.push(prop);
        }
        return properties;
    }
    function parsePropertyOpt(){
        skipWS();
        const propIdent = getIf(c=>(c>="A" && c<="Z"));
        if(propIdent.length == 0){
            return null;
        }

        const propValues = [];
        for(;;){
            propValues.push(parsePropValue());
            skipWS();
            if(scan() != "["){
                break;
            }
        }
        return {propIdent, propValues};
    }
    function parsePropValue(){
        let unescapedStr = "";
        match("[");
        for(;;){
            const ch = get();
            if(ch == "]"){
                break;
            }
            else if(ch == null){
                error("unexpected termination in PropValue");
            }
            unescapedStr += ch;
            if(ch == "\\"){
                const escapedCh = get();
                if((escapedCh == "\n" && scan() == "\r") ||
                   (escapedCh == "\r" && scan() == "\n")){
                    // convert "\n\r" and "\r\n" to single "\r"
                    discard();
                    unescapedStr += "\n";
                }
                else if(escapedCh == "\r"){
                    // convert "\r" to "\n"
                    unescapedStr += "\n";
                }
                else{
                    // "]", "\", ":", "\n", spaces, etc...
                    unescapedStr += escapedCh;
                }
            }
        }
        return unescapedStr;
    }
}

})();

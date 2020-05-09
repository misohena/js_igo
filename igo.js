"use strict";

(function(){
const igo = window.igo = window.igo || {};

const EMPTY = igo.EMPTY = 0;
const BLACK = igo.BLACK = 1;
const WHITE = igo.WHITE = 2;
const NPOS = igo.NPOS = -1; //invalid position
// use history & game only. do not use board
const POS_PASS = igo.POS_PASS = -2;
const POS_RESIGN = igo.POS_RESIGN = -3;

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
// Position
//
function isIntersectionPosition(pos){return pos >= 0;}
function isValidPosition(pos, w, h){return pos >= 0 && pos < w * h;}
function toPosition(x, y, w){return x + y * w;}

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
    setAtInternal(pos, state)
        {Array2Bits.set(this.intersections, pos, state);}
    setAt(pos, state)
        {this.setAtInternal(pos, state);}
    isEmpty(pos)
        {return pos != NPOS && this.getAt(pos) == EMPTY;}
    removeStone(pos)
        {this.setAt(pos, EMPTY);}

    hookSetAt(func){
        if(typeof(func) == "function"){
            this.setAt = (pos, state)=>{
                func(pos, state);
                this.setAtInternal(pos, state);
            };
        }
    }
    unhookSetAt(){
        delete this.setAt;
    }

    // Position(index of intersections)

    toPosition(x, y)
        {return toPosition(x, y, this.w);}
    toX(pos)
        {return pos % this.w;}
    toY(pos)
        {return pos / this.w | 0;}
    isValidPosition(pos)
        {return pos != NPOS && isValidPosition(pos, this.w, this.h);}
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
            history.pushPass(koPosOld);
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
        if(board.isValidPosition(move.pos)){//exclude NPOS,POS_PASS,POS_RESIGN
            board.removeStone(move.pos);
        }
        if(move.removedStones){
            for(const pos of move.removedStones){
                board.setAt(pos, oppositeColor);
            }
            board.removePrisoners(oppositeColor, move.removedStones.length);
        }
        board.setKoPos(move.koPosOld);
        if(board.isValidPosition(move.pos) || move.pos == POS_PASS){
            board.setTurn(color);
        }
    }
    static redoBoard(move, board){
        // move {pos, removedStones, koPosOld, koPosNew}
        const color = board.getTurn();
        const oppositeColor = getOppositeColor(color);
        if(board.isValidPosition(move.pos)){//exclude NPOS,POS_PASS,POS_RESIGN
            board.setAt(move.pos, color);
        }
        if(move.removedStones){
            for(const pos of move.removedStones){
                board.removeStone(pos);
            }
            board.addPrisoners(oppositeColor, move.removedStones.length);
        }
        board.setKoPos(move.koPosNew);
        if(board.isValidPosition(move.pos) || move.pos == POS_PASS){
            board.setTurn(oppositeColor);
        }
    }
}

class HistoryNode{
    constructor(prev, pos, removedStones, koPosOld, koPosNew){
        this.prev = prev;
        this.nexts = [];
        this.pos = pos;
        this.removedStones = removedStones;
        this.koPosOld = koPosOld;
        this.koPosNew = koPosNew;
        this.lastVisited = null; //?
        // this.comment = <string>
        // this.props = {<id>: {value:<value>, inherit:<boolean>}, ...}
        // this.setup = {intersections: [{pos, oldState, newState},...] }
    }
    shallowClone(){
        const node = new HistoryNode(this.prev, this.pos, this.removedStones, this.koPosOld, this.koPosNew);
        node.nexts = this.nexts;
        node.lastVisited = this.lastVisited;
        if(this.comment !== undefined){node.comment = this.comment;}
        if(this.props !== undefined){node.props = this.props;}
        if(this.setup !== undefined){node.setup = this.setup;}
        return node;
    }
    // Node Types
    isPass(){return this.pos == POS_PASS;}
    isResign(){return this.pos == POS_RESIGN;}
    isPlace(){return isIntersectionPosition(this.pos);}
    isMove(){return this.isPlace() || this.isPass();}

    // Prev Node
    isRoot(){return !this.prev;}
    getRoot(){
        let node = this; while(node.prev){node = node.prev;}
        return node;
    }
    getNumberOfSiblings(){
        return this.prev ? this.prev.nexts.length : 0;
    }
    getMoveNumber(){
        let num = 0;
        for(let node = this; node; node = node.prev){
            if(node.isMove()){
                ++num;
            }
        }
        return num;
    }

    // Next Nodes
    findNext(pos){return this.nexts.find(node=>node.pos == pos);}
    deleteNext(pos){
        const index = this.nexts.findIndex(node=>node.pos == pos);
        if(index >= 0){
            const node = this.nexts[index];
            this.nexts.splice(index, 1);
            // lastVisitedが指している手が削除されたときの対応
            if(this.lastVisited === node){
                ///@todo [0]にしてしまっていい？　いっそnullの方がいい？
                this.lastVisited = this.nexts.length == 0
                    ? null : this.nexts[0];
            }
        }
    }
    changeNextOrder(pos, delta){
        const index = this.nexts.findIndex(move=>move.pos == pos);
        if(index >= 0){
            const move = this.nexts[index];
            this.nexts.splice(index, 1);
            const newIndex = Math.min(Math.max(index + delta, 0), this.nexts.length);
            this.nexts.splice(newIndex, 0, move);
        }
    }

    // Tree
    visitAllNodes(enter, leave){
        if(enter){enter(this);}
        for(const next of this.nexts){
            next.visitAllNodes(enter, leave);
        }
        if(leave){leave(this);}
    }

    isDescendantOf(node){
        if(!node){
            return false;
        }
        for(let ancestor = this; ancestor; ancestor = ancestor.prev){
            if(node == ancestor){
                return true;
            }
        }
        return false;
    }
    isAncestorOf(node){
        if(!node){
            return false;
        }
        return node.isDescendantOf(this);
    }
    findDepthFirst(pred){
        if(pred(this)){
            return this;
        }
        for(const next of this.nexts){
            const found = next.find(pred);
            if(found){
                return found;
            }
        }
        return null;
    }
    findBreadthFirst(pred){
        let curr = [this];
        let next = [];
        while(curr.length > 0){
            for(const node of curr){
                if(pred(node)){
                    return node;
                }
                next.push.apply(next, node.nexts);
            }
            curr = next;
            next = [];
        }
        return null;
    }
    findByQuery(queries, board){
        if(!(queries instanceof Array)){
            queries = [queries];
        }
        let curr = this;
        for(let q of queries){
            // move number : forward first variations
            if(typeof(q) == "number"){
                while(q > 0 && curr.nexts.length > 0){
                    curr = curr.nexts[0];
                    --q;
                }
            }
            // SGF point string : find point breadth-first
            else if(typeof(q) == "string"){ //coordinate
                const pos = igo.parseSGFMove(q, board.w, board.h); ///@todo not supported !isMove() (ex:resign, setup node)
                const target = curr.findBreadthFirst(node=>node.pos==pos);
                if(target){
                    curr = target;
                }
            }
        }
        return curr;
    }

    // Properties
    addProperty(id, value, inherit){
        if(!this.props){this.props = {};}
        return this.props[id] = {value, inherit:inherit===true};
    }
    hasProperty(id, inherit){
        return this.props ? this.props.hasOwnProperty(id) :
            // if inherit is true, look back prev
            inherit && this.prev ? this.prev.hasProperty(id, inherit) :
            false;
    }
    getProperty(id, inherit){
        return this.props ? this.props[id] :
            // if inherit is true, look back prev
            inherit && this.prev ? this.prev.getProperty(id, inherit) :
            false;
    }
    removeProperty(id){
        if(this.props){
            delete this.props[id];
        }
    }
    acquireProperty(id, defaultValue){
        if(this.props && this.props.hasOwnProperty(id)){
            return this.props[id];
        }
        else{
            return this.addProperty(id, defaultValue, false);
        }
    }
    // Comment
    hasComment(){return typeof(this.comment) == "string";}
    getComment(){return this.comment;}
    setComment(str){this.comment = str;}
    removeComment(str){delete this.comment;}
    // Setup
    hasSetup(){return !!this.setup;}
    getSetup(){return this.setup;}
    acquireSetup(){
        if(!this.setup){
            this.setup = {intersections:[]}; //[{pos, oldState, newState},...]
        }
        return this.setup;
    }
    setSetup(intersections){
        // do not recycle current this.setup object.
        // see shallowClone() usage in toSGF()
        this.setup = {intersections};
    }
    addIntersectionChange(pos, oldState, newState){
        const intersections = this.acquireSetup().intersections;
        let index;//lower bound
        for(index = 0; index < intersections.length && intersections[index].pos < pos; ++index);
        if(index == intersections.length || pos < intersections[index].pos){
            intersections.splice(index, 0, {pos, oldState, newState}); //new change
        }
        else{
            //pos == intersections[index].pos
            if(intersections[index].oldState == newState){
                intersections.splice(index, 1); //discard change
            }
            else{
                intersections[index].newState = newState; //merge changes
            }
        }
    }
}

class HistoryTree{
    constructor(){
        this.moveNumber = 0;
        this.pointer = this.first = new HistoryNode(null, NPOS, null, NPOS, NPOS);
    }
    getCurrentNode(){return this.pointer;}
    getNextNodes(){return this.pointer ? this.pointer.nexts : [];}
    getPreviousNode(){return this.pointer.prev;}
    getFirstNodes(){return this.first.nexts;}
    getRootNode(){return this.first;}
    findNextNode(pos){return this.pointer ?this.pointer.findNext(pos) : null;}

    setCommentToCurrentNode(text){
        this.pointer.setComment(text);
    }
    setPropertyToCurrentNode(id, value, inherit){
        this.pointer.addProperty(id, value, inherit);
    }

    // MoveNumber
    getMoveNumber(){return this.moveNumber;}

    getMoveNumberAt(pos){// return move number of stone specified by pos
        let num = this.moveNumber;
        for(let node = this.pointer; node; node = node.prev){
            if(node.pos == pos){
                return num;
            }
            if(node.isMove()){
                --num;
            }
        }
        return -1;
    }

    // Move

    pushPass(koPosOld){
        this.push(POS_PASS, null, koPosOld, NPOS);
    }
    pushResign(koPos){
        this.push(POS_RESIGN, null, koPos, koPos); //keep koPos, do not rotate a turn
    }
    push(pos, removedStones, koPosOld, koPosNew){
        const moveSamePos = this.pointer.findNext(pos);
        if(moveSamePos){
            this.pointer.lastVisited = moveSamePos;
            this.pointer = moveSamePos;
        }
        else{
            const newMove = new HistoryNode(this.pointer, pos, removedStones, koPosOld, koPosNew);
            this.pointer.nexts.push(newMove);
            this.pointer.lastVisited = newMove;
            this.pointer = newMove;
        }
        if(isIntersectionPosition(pos) || pos == POS_PASS){ //exclude NPOS, POS_RESIGN
            ++this.moveNumber;
        }
    }

    // Undo/Redo

    undo(board, game){
        if( ! this.pointer.prev){
            return false;
        }
        const move = this.pointer;

        // undo Game state
        if(move.pos == POS_RESIGN){
            game.cancelFinish();
        }
        else if(this.pointer.pos == POS_PASS && this.pointer.prev.pos == POS_PASS){
            game.cancelFinish();
        }
        // undo board
        HistoryUtil.undoBoard(move, board);
        // undo move number
        if(isIntersectionPosition(move.pos) || move.pos == POS_PASS){ //exclude NPOS, POS_RESIGN
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
        // redo Game state
        if(move.pos == POS_RESIGN){
            game.setFinished(getOppositeColor(board.getTurn()));
        }
        else if(this.pointer.pos == POS_PASS && this.pointer.lastVisited.pos == POS_PASS){
            game.setFinished(EMPTY); ///@todo 勝敗判定！
        }
        // redo board
        HistoryUtil.redoBoard(move, board);
        // redo move number
        if(isIntersectionPosition(move.pos) || move.pos == POS_PASS){ //exclude NPOS, POS_RESIGN
            ++this.moveNumber;
        }
        this.pointer = this.pointer.lastVisited;
        return true;
    }
    redoTo(descendant, board, game){
        const from = this.pointer;
        if( ! descendant.isDescendantOf(from)){
            return false;
        }
        // lastVisitedをdescendantに向かって倒していく
        for(let node = descendant; node && node != from; node = node.prev){
            node.prev.lastVisited = node;
        }
        // descendantにたどり着くまでredoしていく
        while(this.pointer != descendant){
            if(!this.redo(board, game)){
                return false;
            }
        }
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
        this.pointer.deleteNext(pos);
    }
    changeBranchOrder(pos, delta){
        this.pointer.changeNextOrder(pos, delta);
    }
}
igo.HistoryTree = HistoryTree;


function enumerateBoardChanges(oldBoard, newBoard){ //diffBoard
    const newChanges = [];
    for(let y = 0; y < newBoard.h; ++y){
        for(let x = 0; x < newBoard.w; ++x){
            const pos = newBoard.toPosition(x, y);
            const oldState = (x < oldBoard.w && y < oldBoard.h) ? oldBoard.getAt(oldBoard.toPosition(x, y)) : EMPTY;
            const newState = newBoard.getAt(pos);
            if(oldState != newState){
                newChanges.push({pos, oldState, newState});
            }
        }
    }
    return newChanges;
}
igo.enumerateBoardChanges = enumerateBoardChanges;

function mergeBoardChanges(oldChanges, newChanges){
    const mergedChanges = [];
    let oldIndex = 0;
    let newIndex = 0;
    while(oldIndex < oldChanges.length && newIndex < newChanges.length){
        if(oldChanges[oldIndex].pos < newChanges[newIndex].pos){
            mergedChanges.push(oldChanges[oldIndex]);
            ++oldIndex;
        }
        else if(newChanges[newIndex].pos < oldChanges[oldIndex].pos){
            mergedChanges.push(newChanges[newIndex]);
            ++newIndex;
        }
        else{
            if(oldChanges[oldIndex].oldState != newChanges[newIndex].newState){
                mergedChanges.push({
                    pos: oldChanges[oldIndex].pos, //==new.pos
                    oldState: oldChanges[oldIndex].oldState,
                    newState: newChanges[newIndex].newState});
            }
            else{
                //discard change
            }
            ++oldIndex;
            ++newIndex;
        }
    }
    while(oldIndex < oldChanges.length){
        mergedChanges.push(oldChanges[oldIndex++]);
    }
    while(newIndex < newChanges.length){
        mergedChanges.push(newChanges[newIndex++]);
    }
    return mergedChanges;
}
igo.mergeBoardChanges = mergeBoardChanges;

function compressBoardChanges(changes, board){
    // changes = [{pos, oldState, newState}, ...]
    // return [{state, left, top, right, bottom}, ...]

    // 横方向に連続している同一交点状態(EMPTY,BLACK,WHITE)への変更をまとめる。
    const intersections = new Array(board.getIntersectionCount());
    for(const c of changes){
        const x = board.toX(c.pos);
        const y = board.toY(c.pos);
        const left = board.leftOf(c.pos);
        const leftIsect = left != NPOS ? intersections[left] : null;
        if(leftIsect && leftIsect.state == c.newState){
            leftIsect.right = x;
            intersections[c.pos] = leftIsect;
        }
        else{
            intersections[c.pos] = {state:c.newState, left:x, top:y, right:x, bottom:y};
        }
    }
    // 縦方向に同じ状態、横幅のものをまとめる。
    for(let y = 1; y < board.h; ++y){
        for(let x = 0; x < board.w; ++x){
            let pos = board.toPosition(x, y);
            const currIsect = intersections[pos];
            if(currIsect){
                const above = board.above(pos);
                const aboveIsect = intersections[above];
                if(aboveIsect &&
                   aboveIsect.state == currIsect.state &&
                   aboveIsect.left == currIsect.left &&
                   aboveIsect.right == currIsect.right){
                    aboveIsect.bottom = y;
                    for(; x <= aboveIsect.right; ++x, pos = board.rightOf(pos)){
                        intersections[pos] = aboveIsect;
                    }
                }
            }
        }
    }
    // unique
    const compressedChanges = [];
    for(const isect of intersections){
        if(isect){
            if(compressedChanges.indexOf(isect) < 0){
                compressedChanges.push(isect);
            }
        }
    }
    return compressedChanges;
}

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
        this.firstTurn = BLACK;
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
    setFirstTurn(color){
        if(this.getMoveNumber() > 0){
            return false; //途中で変えるのは不正
        }
        if(!isValidColor(color)){
            return false;
        }
        this.firstTurn = color;
        this.board.setTurn(color);
        return true;
    }
    getFirstTurn(){
        return this.firstTurn;
    }
    setIntersectionStateForced(pos, state){
        if(this.getMoveNumber() > 0){
            return false; //途中で変えるのは不正
        }
        if(this.board.isValidPosition(pos)){
            this.board.setAt(pos, state);
        }
        return true;
    }

    pass(){
        if( ! this.finished){
            const prevMoveIsPass = this.history.getCurrentNode().pos == POS_PASS;
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
            this.history.pushResign(this.board.koPos); //keep koPos, do not rotate a turn
        }
    }

    // History

    getMoveNumber(){return this.history.getMoveNumber();}

    undo(){return this.history.undo(this.board, this);}
    redo(){return this.history.redo(this.board, this);}
    redoTo(descendant){return this.history.redoTo(descendant, this.board, this);}
    redoByQuery(queries){
        return this.history.redoTo(
            this.history.getCurrentNode().findByQuery(queries, this.board),
            this.board, this);
    }
    undoAll(){this.history.undoAll(this.board, this);}
    redoAll(){this.history.redoAll(this.board, this);}
    backToMove(pos){this.history.backToMove(pos, this.board, this);}

    setCommentToCurrentNode(text){this.history.setCommentToCurrentNode(text);}

    // SGF

    toSGF(fromCurrentNode){
        const board = this.board;
        function toPointLetter(n){
            if(!(n >= 0 && n <= 51)){
                throw new Error("SGF coordinates out of range : " + n);
            }
            // 0~25:a~z(0x61~)
            //26~51:A~Z(0x41~)
            return String.fromCharCode(n<26 ? 0x61+n : 0x41-26+n);
        }
        function toSGFPointXY(x, y){
            return toPointLetter(x) + toPointLetter(y);
        }
        function toSGFPoint(pos){
            return toSGFPointXY(board.toX(pos), board.toY(pos));
        }
        function toSGFColor(color){
            return color == BLACK ? "B" : color == WHITE ? "W" : "E";
        }
        function toSGFText(str){
            return str.replace(/([\]\\:])/gi, "\\$1").replace(/[\t\v]/gi, " ");
        }
        function toSGFSimpleText(str){
            return str.replace(/([\]\\:])/gi, "\\$1").replace(/[\t\v\n\r]/gi, " ");
        }

        // determine start node
        let startNode;
        let firstTurn;
        if(fromCurrentNode){
            // make setup property
            const emptyBoard = new Board(board.w, board.h);
            const intersectionChanges = enumerateBoardChanges(emptyBoard, board);
            // clone current node
            startNode = this.history.getCurrentNode().shallowClone();
            startNode.prev = null;
            startNode.pos = NPOS;
            startNode.removedStones = null;
            startNode.koPosOld = NPOS;
            startNode.setSetup(intersectionChanges); //setSetupはclone元の状態を変更しない、はず。
            // first turn
            firstTurn = this.getTurn();
        }
        else{
            startNode = this.history.getRootNode();
            firstTurn = this.firstTurn;
        }

        // Root Node
        let rootProperties =
            "GM[1]" +
            "SZ[" + (board.w == board.h ? board.w : board.w + ":" + board.h) + "]" +
            (firstTurn == WHITE ? "PL[W]" : ""); ///@todo PLはsetupプロパティとして扱う

        // Game Info Properties (game-infoはRoot Nodeにしかない)
        const rootNode = this.history.getRootNode();
        for(const propType of SGF_GAME_INFO_PROPERTIES){
            if(rootNode.hasProperty(propType.id)){
                const propValue = rootNode.getProperty(propType.id).value;
                if(propType.type == "text"){
                    rootProperties += propType.id + "[" + toSGFText(propValue) + "]";
                }
                else{
                    rootProperties += propType.id + "[" + toSGFSimpleText(propValue) + "]";
                }
            }
        }

        //
        let str = "";
        let moveNumber = 0;
        let turn = firstTurn;

        startNode.visitAllNodes(
            (node)=>{ //enter
                if(node.isResign()){
                    return; //ignore resign
                }
                if(node.getNumberOfSiblings() > 1){
                    str += "(";
                }
                str += ";"; //start node
                if(node.isRoot()){
                    str += rootProperties;
                }
                if(node.isMove()){
                    // B, W
                    str +=
                        toSGFColor(turn) +
                        "[" +
                        (node.isPass() ? "" : toSGFPoint(node.pos)) +
                        "]";
                    ++moveNumber;
                    turn = getOppositeColor(turn);
                }
                if(node.hasSetup()){
                    const setup = node.getSetup();
                    if(setup && setup.intersections){
                        for(const change of compressBoardChanges(setup.intersections, board)){
                            // AB, AW, AE
                            str += "A" + toSGFColor(change.state) + "[" +
                                toSGFPointXY(change.left, change.top) +
                                (change.left != change.right || change.top != change.bottom ?
                                 ":" + toSGFPointXY(change.right, change.bottom) : "") + "]";
                        }
                    }
                }
                if(node.hasProperty("marks")){
                    const marks = node.getProperty("marks").value;
                    if(marks){
                        for(const mark of marks){
                            if(mark.type == "text"){
                                str += "LB["  + toSGFPoint(mark.pos) + ":" + toSGFSimpleText(mark.text) + "]";
                            }
                            else{
                                const pid =
                                      mark.type == "circle" ? "CR" :
                                      mark.type == "triangle" ? "TR" :
                                      mark.type == "square" ? "SQ" :
                                      mark.type == "cross" ? "MA" :
                                      "MA";
                                str += pid + "[" + toSGFPoint(mark.pos) + "]";
                            }
                        }
                    }
                }
                if(node.hasComment()){
                    // C
                    str += "C[" + toSGFText(node.getComment()) + "]";
                }
            },
            (node)=>{ //leave
                if(node.isResign()){
                    return; //ignore resign
                }
                if(node.getNumberOfSiblings() > 1){
                    str += ")";
                }
                --moveNumber;
                turn = getOppositeColor(turn);
            });
        return "(" + str + ")";
    }


    static fromSGF(str){
        const collection = parseSGF(str);
        const rootTree = collection[0];

        // Parse root node
        const rootNode = rootTree.nodes[0];
        let boardSize = [19];
        for(let i = 0; i < rootNode.length; ++i){
            const property = rootNode[i];
            switch(property.propIdent){
            case "GM":
                if(property.propValues[0] != "1"){
                    throw new Error("Unsupported SGF : Not GM[1]");
                }
                break;
            case "SZ":
                boardSize = splitSGFCompose(property.propValues[0]).map(s=>{
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
        const w = boardSize[0];
        const h = boardSize.length >= 2 ? boardSize[1] : w;
        const game = new Game(w, h);

        // represent all moves & create history tree
        processTree(rootTree, 0);
        return game;

        function processTree(tree, startIndex){
            for(let ni = startIndex; ni < tree.nodes.length; ++ni){
                const nodeProps = tree.nodes[ni];
                // process node
                let moved = false;
                for(const prop of nodeProps){
                    const pid = prop.propIdent;
                    const pvalues = prop.propValues;
                    switch(pid){
                    // Move Properties
                    case "B":
                    case "W":
                        {
                            if(moved){
                                throw new Error("Moved twice in a node");
                            }
                            moved = true;
                            const move = pvalues[0];
                            const color = pid == "B" ? BLACK : WHITE;
                            if(game.getTurn() != color){
                                if( ! game.setFirstTurn(color)){ //first move only
                                    throw new Error("Unexpected player change " + pid + " " + move);
                                }
                            }
                            const pos = parseSGFMove(move, w, h);
                            if(pos == POS_PASS){
                                game.pass();
                            }
                            else{
                                if(!game.putStone(pos)){
                                    throw new Error("SGF includes a illegal move at " + move);
                                }
                            }
                        }
                        break;
                    // Setup Properties
                    case "AB":
                    case "AW":
                    case "AE":
                        for(const value of pvalues){
                            const points = parseSGFComposedPoint(value, w, h);
                            for(const pos of points){
                                if(isValidPosition(pos, w, h)){
                                    const oldState = game.board.getAt(pos);
                                    const newState = pid == "AB" ? BLACK : pid == "AW" ? WHITE : EMPTY;
                                    game.history.getCurrentNode().addIntersectionChange(pos, oldState, newState);
                                    game.setIntersectionStateForced(pos, newState);
                                }
                            }
                        }
                        break;
                    case "PL":
                        {
                            const color = pvalues[0] == "B" ? BLACK : pvalues[0] == "W" ? WHITE : EMPTY;
                            if(color == EMPTY){
                                throw new Error("Invalid color " + pid + " " + pvalues[0]);
                            }
                            if( ! game.setFirstTurn(color)){ //first move only
                                throw new Error("Unexpected player change by PL");
                            }
                        }
                        break;
                    // Node Annotation Properties
                    case "C":
                        game.setCommentToCurrentNode(parseSGFText(pvalues[0]));
                        break;
                    // Markup Properties
                    case "MA":
                    case "CR":
                    case "SQ":
                    case "TR":
                        {
                            const node = game.history.getCurrentNode();
                            const marks = node.acquireProperty("marks", []).value;
                            const points = pvalues.map(value=>(value != "") ? parseSGFComposedPoint(value, w, h) : []).reduce((acc, curr)=>acc.concat(curr));
                            for(const point of points){
                                marks.push({
                                    pos: point,
                                    type: pid == "CR" ? "circle" :
                                        pid == "SQ" ? "square" :
                                        pid == "TR" ? "triangle" :
                                        "cross"});
                            }
                        }
                        break;
                    case "LB":
                        {
                            const node = game.history.getCurrentNode();
                            const marks = node.acquireProperty("marks", []).value;
                            for(const value of pvalues){
                                const valuePointText = splitSGFCompose(value);
                                const point = parseSGFPoint(valuePointText[0], w, h);
                                const text = parseSGFSimpleText(valuePointText[1]);
                                marks.push({pos:point, type:"text", text});
                            }
                        }
                        break;
                    // Miscellaneous Properties
                    case "VW":
                        {
                            const points = pvalues.map(value=>(value != "") ? parseSGFComposedPoint(value, w, h) : []).reduce((acc, curr)=>acc.concat(curr));
                            game.history.setPropertyToCurrentNode("VW", points, true); //inherit (to subsequences, subtrees)
                        }
                        break;
                    default:
                        // Game Info Properties
                        {
                            const propType = getSGFGameInfoPropertyType(pid);
                            if(propType){
                                const value = propType.type == "text" ? parseSGFText(pvalues[0]) :
                                      // number, real, simpletext
                                      parseSGFSimpleText(pvalues[0]);
                                game.history.getRootNode().addProperty(pid, value);
                            }
                        }
                        break;
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
function splitSGFCompose(value){
    // \: => single
    // \\: => composed
    let colonPos = -1;
    for(let i = 0; i < value.length; ++i){
        switch(value.charAt(i)){
        case "\\":
            ++i; //skip next char
            break;
        case ":":
            if(colonPos != -1){
                throw new Error("Too many colon in compose value : " + value);
            }
            colonPos = i;
            break;
        }
    }
    return colonPos == -1 ? [value] : [value.substring(0, colonPos), value.substring(colonPos+1)];
}
function parseSGFComposedPoint(value, w, h){
    // ex: AB[jk:lm]
    const values = splitSGFCompose(value);
    if(values.length == 1){
        return [parseSGFPoint(values[0], w, h)];
    }
    else{
        const points = [];
        const lt = parseSGFPointXY(values[0], w, h);
        const rb = parseSGFPointXY(values[1], w, h);
        for(let y = lt.y; y <= rb.y; ++y){
            for(let x = lt.x; x <= rb.x; ++x){
                points.push(toPosition(x, y, w));
            }
        }
        return points;
    }
}
function parseSGFMove(value, w, h){
    if(value == "" || (value == "tt" && (w == 19 && h == 19))){
        return POS_PASS;
    }
    return parseSGFPoint(value, w, h);
}
igo.parseSGFMove = parseSGFMove;
function parseSGFPoint(value, w, h){
    const p = parseSGFPointXY(value, w, h);
    return toPosition(p.x, p.y, w);
}
function parseSGFPointXY(value, w, h){
    function fromLetter(charCode){
        if(charCode >= 0x61 && charCode <= 0x7a){
            return charCode - 0x61;
        }
        else if(charCode >= 0x41 && charCode <= 0x5a){
            return charCode - 0x41 + 26;
        }
        else{
            throw new Error("Invalid point character '" + String.fromCharCode(charCode) + "' in " + value);
        }
    }
    const x = fromLetter(value.charCodeAt(0));
    const y = fromLetter(value.charCodeAt(1));
    if(!(x >= 0 && y >= 0 && x < w && y < h)){
        throw new Error("Out of board : " + value + " (x:" + x + " y:" + y + ")");
    }
    return {x, y};
}
function parseSGFText(value){
    return value.replace(/\\(\n\r?|\r\n?)/gi, "").replace(/\\(.)/gi, "$1").replace(/\t\v/gi, " ");
}
function parseSGFSimpleText(value){
    return value.replace(/\\(\n\r?|\r\n?)/gi, "").replace(/\\(.)/gi, "$1").replace(/(\t|\v|\n\r?|\r\n?)/gi, " ");
}

const SGF_GAME_INFO_PROPERTIES = [
    {id:"CP", desc:"著作権者情報"},
    {id:"US", desc:"ユーザ名"},
    {id:"AN", desc:"評者名"},
    {id:"SO", desc:"出典"},
    {id:"EV", desc:"大会名"},
    {id:"GN", desc:"対局名"},
    {id:"RO", desc:"ラウンド数"},
    {id:"DT", desc:"対局日"},
    {id:"PC", desc:"対局場所"},
    {id:"BT", desc:"黒チーム名"},
    {id:"PB", desc:"黒番対局者名"},
    {id:"BR", desc:"黒ランク"},
    {id:"WT", desc:"白チーム名"},
    {id:"PW", desc:"白番対局者名"},
    {id:"WR", desc:"白ランク"},
    {id:"RU", desc:"ルール"},
    {id:"OT", desc:"制限時間方式"},
    {id:"TM", desc:"持ち時間(秒)", type:"real"},
    {id:"HA", desc:"置き石", type:"number"},
    {id:"KM", desc:"コミ", type:"real"},
    {id:"RE", desc:"結果"},
    {id:"ON", desc:"布石名"},
    {id:"GC", desc:"対局コメント", type:"text"},
];
igo.SGF_GAME_INFO_PROPERTIES = SGF_GAME_INFO_PROPERTIES;
function getSGFGameInfoPropertyType(pid){
    return SGF_GAME_INFO_PROPERTIES.find(pt=>pt.id==pid);
}
igo.getSGFGameInfoPropertyType = getSGFGameInfoPropertyType;

})();

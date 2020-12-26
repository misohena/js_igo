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
function getIndexOfEmptyBlackWhite(intersectionState)
    {return intersectionState;}
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

    setAll(array){
        if(array){
            const size = Math.min(array.length, this.getIntersectionCount());
            for(let pos = 0; pos < size; ++pos){
                this.setAt(pos, array[pos] & 3);
            }
        }
    }

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

        const turnOld = this.turn;
        this.rotateTurn();

        if(history){
            history.pushPass(koPosOld, turnOld);
        }
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

        const turnOld = this.turn;
        this.rotateTurn();

        if(history){
            history.pushPlace(pos, removedStonesArray, koPosOld, this.koPos, turnOld);
        }
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
// BoardDiff
//

class BoardDiff{
    constructor(turnChange, intersectionChanges){
        this.turn = turnChange || null; //{oldTurn, newTurn}
        this.intersections = intersectionChanges || null; //[{pos, oldState, newState}, ...] (sorted by pos)
    }

    addIntersectionChange(pos, oldState, newState){
        const intersections = this.intersections || (this.intersections = []);
        let index;//lower bound
        for(index = 0; index < intersections.length && intersections[index].pos < pos; ++index);
        if(index == intersections.length || pos < intersections[index].pos){
            intersections.splice(index, 0, {pos, oldState, newState}); //new changes
        }
        else{
            //pos == intersections[index].pos
            if(intersections[index].oldState == newState){
                intersections.splice(index, 1); //discard changes
            }
            else{
                intersections[index].newState = newState; //merge changes
            }
        }
    }
    setTurnChange(oldTurn, newTurn){
        this.turn = oldTurn != newTurn ? {oldTurn, newTurn} : null;
    }

    // diff

    static diff(oldBoard, newBoard){
        return new BoardDiff(
            BoardDiff.diffTurn(oldBoard, newBoard),
            BoardDiff.diffIntersections(oldBoard, newBoard));
    }
    static diffTurn(oldBoard, newBoard){
        return oldBoard.turn != newBoard.turn ? {oldTurn:oldBoard.turn, newTurn:newBoard.turn} : null;
    }
    static diffIntersections(oldBoard, newBoard){
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

    // merge

    static merge(oldChanges, newChanges){
        if(!oldChanges){return newChanges;}
        if(!newChanges){return oldChanges;}
        return new BoardDiff(
            BoardDiff.mergeTurn(oldChanges.turn, newChanges.turn),
            BoardDiff.mergeIntersections(oldChanges.intersections, newChanges.intersections));
    }
    static mergeTurn(oldChange, newChange){
        if(!oldChange){return newChange;}
        if(!newChange){return oldChange;}
        return oldChange.oldTurn != newChange.newTurn ? {oldTurn:oldChange.oldTurn, newTurn:newChange.newTurn} : null;
    }
    static mergeIntersections(oldChanges, newChanges){
        if(!oldChanges){return newChanges;}
        if(!newChanges){return oldChanges;}
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

    // apply

    applyTo(board){
        BoardDiff.apply(board, this);
    }

    static apply(board, changes){
        if(!changes){return;}
        BoardDiff.applyTurn(board, changes.turn);
        BoardDiff.applyIntersections(board, changes.intersections);
    }
    static applyTurn(board, change){
        if(!change){return;}
        const oldTurn = board.getTurn();
        if(oldTurn != change.oldTurn){
            // broken, update oldTurn
            change.oldTurn = oldTurn;
            ///@todo delete change if new oldTurn equals newTurn ?
        }
        board.setTurn(change.newTurn);
    }
    static applyIntersections(board, changes){
        if(!changes){return;}
        for(const intersection of changes){
            const oldState = board.getAt(intersection.pos);
            if(oldState != intersection.oldState){
                // broken, update oldState
                intersection.oldState = oldState;
                ///@todo delete change if new oldState equals newState ?
            }
            board.setAt(intersection.pos, intersection.newState);
        }
    }

    // apply inverse

    applyInverseTo(board){
        BoardDiff.applyInverse(board, this);
    }
    static applyInverse(board, changes){
        if(!changes){return;}
        BoardDiff.applyInverseTurn(board, changes.turn);
        BoardDiff.applyInverseIntersections(board, changes.intersections);
    }
    static applyInverseTurn(board, change){
        if(!change){return;}
        board.setTurn(change.oldTurn);
    }
    static applyInverseIntersections(board, changes){
        if(!changes){return;}
        for(const intersection of changes){
            board.setAt(intersection.pos, intersection.oldState);
        }
    }

    // compress
    // (for SGF compressed point lists)

    getCompressedIntersectionChanges(board){
        return BoardDiff.compressIntersections(this.intersections, board);
    }

    static compressIntersections(changes, board){
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
}
igo.BoardDiff = BoardDiff;

    // compress



//
// BoardChanges
//

class BoardChanges {
    static createUndoMove(color, pos, removedStones, koPosOld){
        return new BoardChanges(
            (color==WHITE ? removedStones : null),
            (color==BLACK ? removedStones : null),
            pos,
            koPosOld,
            color,
            (color==WHITE && removedStones ? -removedStones.length : 0),
            (color==BLACK && removedStones ? -removedStones.length : 0)
        );
    }
    constructor(black, white, empty, koPos, turn, blackPrisoners, whitePrisoners){
        this.black = black;
        this.white = white;
        this.empty = empty;
        this.koPos = koPos;
        this.turn = turn;
        this.blackPrisoners = blackPrisoners;
        this.whitePrisoners = whitePrisoners;
    }
    isEmpty(){
        return (this.black === null || this.black === undefined || (this.black instanceof Array && this.black.length == 0)) &&
            (this.white === null || this.white === undefined || (this.white instanceof Array && this.white.length == 0)) &&
            (this.empty === null || this.empty === undefined || (this.empty instanceof Array && this.empty.length == 0)) &&
            (this.koPos === null || this.koPos === undefined) &&
            (this.turn === null || this.turn === undefined) &&
            (typeof(this.blackPrisoners) != "number" || this.blackPrisoners == 0) &&
            (typeof(this.whitePrisoners) != "number" || this.whitePrisoners == 0);
    }
    applyTo(board){
        function setIntersections(positions, color){
            if(typeof(positions) == "number" && board.isValidPosition(positions)){
                board.setAt(positions, color);
            }
            else if(positions instanceof Array){
                for(const pos of positions){
                    if(typeof(pos) == "number" && board.isValidPosition(pos)){
                        board.setAt(pos, color);
                    }
                }
            }
        }
        setIntersections(this.black, BLACK);
        setIntersections(this.white, WHITE);
        setIntersections(this.empty, EMPTY);
        if(typeof(this.koPos) == "number"){
            board.setKoPos(this.koPos);
        }
        if(typeof(this.turn) == "number" && isValidColor(this.turn)){
            board.setTurn(this.turn);
        }
        function addPrisoners(color, delta){
            if(typeof(delta) == "number"){
                if(delta < 0){
                    board.removePrisoners(color, -delta);
                }
                else{
                    board.addPrisoners(color, delta);
                }
            }
        }
        addPrisoners(BLACK, this.blackPrisoners);
        addPrisoners(WHITE, this.whitePrisoners);
    }
}


//
// History
//

class HistoryNode{
    constructor(prev, pos, koPosNew, boardUndo){
        // tree
        this.prev = prev;
        this.nexts = [];
        this.lastVisited = null; //?
        // move
        this.pos = pos;
        this.koPosNew = koPosNew;
        // undo
        this.boardUndo = boardUndo;
        // properties
        //this.comment = <string>
        //this.props = {<id>: {value:<value>, inherit:<boolean>}, ...}
        //this.setup = BoardDiff
    }
    shallowClone(){
        const node = new HistoryNode(this.prev, this.pos, this.koPosNew, this.boardUndo);
        node.nexts = this.nexts;
        node.lastVisited = this.lastVisited;
        if(this.comment !== undefined){node.comment = this.comment;}
        if(this.props !== undefined){node.props = this.props;}
        if(this.setup !== undefined){node.setup = this.setup;}
        return node;
    }
    isEmpty(){
        return this.pos == NPOS &&
            (this.boardUndo == null || this.boardUndo.isEmpty()) &&
            this.comment === undefined &&
            this.props === undefined && ///@todo check inside of this.props
            this.setup === undefined &&
            this.nexts.length <= 1;
    }
    removeThisNodeOnly(){ //remove this node only. add next nodes to previous node
        if(this.isEmpty()){ //空でないときはこのノードの変更点を前後のノードにマージするか迷うので
            const prev = this.prev;
            if(prev){
                const index = prev.nexts.indexOf(this);
                if(index >= 0){
                    prev.nexts.splice(index, 1, ...this.nexts);
                }
                if(prev.lastVisited == this){
                    prev.lastVisited = this.nexts[0];
                }
            }
            for(const next of this.nexts){
                next.prev = prev;
            }
        }
    }

    // Node Types
    isPass(){return this.pos == POS_PASS;}
    isResign(){return this.pos == POS_RESIGN;}
    isPlace(){return isIntersectionPosition(this.pos);}
    isMove(){return this.isPlace() || this.isPass();}
    isSetup(){return this.pos == NPOS;} //not move, not resign (note: can has multiple siblings setup node)

    isSecondConsecutivePass(){
        if(!this.isPass()){
            return false;
        }
        const move = this.getPreviousMove(); //skip setup nodes
        return move && move.isPass();
    }

    // Prev Node
    isRoot(){return !this.prev;}
    getRoot(){
        let node = this; while(node.prev){node = node.prev;}
        return node;
    }
    getPreviousMove(){
        let node = this.prev;
        while(node && !node.isMove()){ //skip setup nodes
            node = node.prev;
        }
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
    getDepth(){
        let num = 0;
        for(let node = this; node.prev; node = node.prev){
            ++num;
        }
        return num;
    }
    getPathFromRoot(forkOnly){
        const dirs = [];
        for(let node = this; node && node.prev; node = node.prev){
            if(!forkOnly || node.prev.nexts.length >= 2){
                dirs.push(node.prev.nexts.indexOf(node));
            }
        }
        dirs.reverse();
        return dirs;
    }
    getNthPrev(n, clamp){
        let node = this;
        while(n > 0 && node.prev){
            node = node.prev;
            --n;
        }
        return n > 0 && !clamp ? null : node;
    }

    // Next Nodes

    findNextByPos(pos){return this.nexts.find(node=>node.pos == pos);}
    deleteNext(node){
        const index = this.nexts.indexOf(node);
        if(index >= 0){
            this.nexts.splice(index, 1);
            // lastVisitedが指している手が削除されたときの対応
            if(this.lastVisited === node){
                ///@todo [0]にしてしまっていい？　いっそnullの方がいい？
                this.lastVisited = this.nexts.length == 0
                    ? null : this.nexts[0];
            }
        }
    }
    changeNextOrder(node, delta){
        const index = this.nexts.indexOf(node);
        if(index >= 0){
            this.nexts.splice(index, 1);
            const newIndex = Math.min(Math.max(index + delta, 0), this.nexts.length);
            this.nexts.splice(newIndex, 0, node);
        }
    }
    getNthNext(n, clamp){
        let node = this;
        while(n > 0 && node.nexts.length > 0){
            node = node.nexts[0];
            --n;
        }
        return n > 0 && !clamp ? null : node;
    }
    getNth(n, clamp){
        return (n >= 0) ?
            this.getNthNext(n, clamp) :
            this.getNthPrev(-n, clamp);
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
    findNextFork(){
        for(let node = this; node.nexts.length > 0; node = node.nexts[0]){
            if(node.nexts.length > 1){
                return node;
            }
        }
        return null;
    }
    findFirstForkOrLast(){
        let node = this;
        while(node && node.nexts.length == 1){
            node = node.nexts[0];
        }
        return node;
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
    findByPath(dirs, forkOnly){
        let node = this, di = 0;
        while(node && di < dirs.length){
            const dir = !forkOnly || node.nexts.length >= 2 ? dirs[di++] : 0;
            if(dir >= node.nexts.length){
                return null;
            }
            node = node.nexts[dir];
        }
        return node;
    }
    findByQuery(queries, board){
        if(!(queries instanceof Array)){
            queries = [queries];
        }
        let curr = this;
        for(let q of queries){
            // move number : forward first variations
            if(typeof(q) == "number"){
                curr = curr.getNth(q, true);
            }
            // SGF point string
            else if(typeof(q) == "string"){
                // AA : find point breadth-first
                if(/^[a-zA-Z][a-zA-Z]$/.test(q)){
                    const pos = igo.parseSGFMove(q, board.w, board.h); // not supported !isMove() (ex:resign, setup node)
                    const target = curr.findBreadthFirst(node=>node.pos==pos);
                    if(target){
                        curr = target;
                    }
                }
                // A : find next fork
                else if(/^[A-Z]$/.test(q)){
                    const index = q.charCodeAt(0) - 0x41;
                    const nextFork = curr.findNextFork();
                    if(nextFork && index < nextFork.nexts.length){
                        curr = nextFork.nexts[index];
                    }
                }
                // _ : first fork
                else if(q == "_"){
                    curr = curr.findFirstForkOrLast();
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

    // Setup property (Board change)
    hasSetup(){return !!this.setup;}
    getSetup(){return this.setup;}
    setSetup(boardChanges){ //set BoardDiff object
        // do not recycle current this.setup object.
        // see shallowClone() usage in HistoryTreeString.toString
        this.setup = boardChanges;
    }
    removeSetup(){delete this.setup;}
    acquireSetup(){
        return this.setup || (this.setup = new BoardDiff());
    }
}

class HistoryTree{
    constructor(){
        this.moveNumber = 0;
        this.pointer = this.first = new HistoryNode(null, NPOS, NPOS, null); //root node
    }
    getCurrentNode(){return this.pointer;}
    getNextNodes(){return this.pointer ? this.pointer.nexts : [];}
    getPreviousNode(){return this.pointer.prev;}
    getRootNode(){return this.first;}
    findNextNodeByPos(pos){return this.pointer.findNextByPos(pos);}

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

    pushPass(koPosOld, turnOld){
        this._pushMoveOrResign(POS_PASS, NPOS, new BoardChanges(null, null, null, koPosOld, turnOld));
    }
    pushResign(koPos, turnOld){
        this._pushMoveOrResign(POS_RESIGN, koPos, null); //keep koPos, do not rotate a turn
    }
    pushPlace(pos, removedStones, koPosOld, koPosNew, turnOld){
        this._pushMoveOrResign(pos, koPosNew, BoardChanges.createUndoMove(turnOld, pos, removedStones, koPosOld));
    }
    pushPlaceIllegal(pos, koPosOld, turnOld){
        this._pushMoveOrResign(pos, NPOS, new BoardChanges(null, null, null, koPosOld, turnOld));
    }
    _pushMoveOrResign(pos, koPosNew, boardUndo){
        // exclude NPOS (setup node)
        // node can have multiple setup nodes
        if(pos == NPOS){
            return; // use pushSetupNode()
        }
        const nodeSamePos = this.pointer.findNextByPos(pos);
        if(nodeSamePos){ //place, pass, resign
            // update UNDO data
            nodeSamePos.boardUndo = boardUndo;
            // select nodeSamePos
            this.pointer.lastVisited = nodeSamePos;
            this.pointer = nodeSamePos;
        }
        else{
            this._pushNewNode(pos, koPosNew, boardUndo);
        }
        if(isIntersectionPosition(pos) || pos == POS_PASS){ //exclude NPOS, POS_RESIGN
            ++this.moveNumber;
        }
    }
    pushSetupNode(koPosNew){
        return this._pushNewNode(NPOS, koPosNew, null);
    }
    _pushNewNode(pos, koPosNew, boardUndo){
        const newNode = new HistoryNode(this.pointer, pos, koPosNew, boardUndo);
        this.pointer.nexts.push(newNode);
        this.pointer.lastVisited = newNode;
        this.pointer = newNode;
        return newNode;
    }

    // Undo/Redo

    undo(board, game){
        if( ! this.pointer.prev){
            return false;
        }
        const node = this.pointer;

        // undo Game state
        if(node.pos == POS_RESIGN){
            game.cancelFinish();
        }
        else if(this.pointer.isSecondConsecutivePass()){
            game.cancelFinish();
        }
        // undo setup
        if(node.setup){
            node.setup.applyInverseTo(board);
        }
        // undo board
        if(node.boardUndo){
            node.boardUndo.applyTo(board);
        }
        // undo move number
        if(isIntersectionPosition(node.pos) || node.pos == POS_PASS){ //exclude NPOS, POS_RESIGN
            --this.moveNumber;
        }
        this.pointer = this.pointer.prev;
        return true;
    }
    redo(board, game){
        if( ! this.pointer.lastVisited){
            return false;
        }
        const node = this.pointer.lastVisited;

        // redo Board state
        if(isIntersectionPosition(node.pos)){
            // 実際に打って再現する。実際に打つことで
            // - 現在の盤面で合法であることを確認する。
            // - 現在の盤面における取石やコウ状態でUNDO情報を更新する。
            if( ! board.putStone(node.pos, board.getTurn(), this)){
                // 以前置けた手が置けなくなっている
                // (前の盤面がフリー編集などによって変わった)。
                // 石は置かずにコウと手番だけ進める。
                // 不正な手としてノードを更新し、
                // undo時に間違った戻しをしないようにする。
                const koPosOld = board.koPos;
                board.setKoPos(NPOS);
                const turnOld = board.getTurn();
                board.rotateTurn();
                this.pushPlaceIllegal(node.pos, koPosOld, turnOld);
            }
        }
        else if(node.pos == POS_PASS){
            board.pass(this);
        }
        else{
            // POS_RESIGN, NPOS
            this.pointer = this.pointer.lastVisited;
            // do not change koPos, turn, moveNumber
        }

        // redo setup
        if(node.setup){
            node.setup.applyTo(board);
        }

        // redo Game state
        if(node.pos == POS_RESIGN){
            game.setFinished(getOppositeColor(board.getTurn()));
        }
        else if(this.pointer.isSecondConsecutivePass()){
            game.setFinished(EMPTY); ///@todo 勝敗判定！
        }
        return true;
    }
    redoTo(descendant, board, game){
        if(!descendant){
            return false;
        }
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
    undoTo(ancestor, board, game){
        while(this.pointer != ancestor && this.pointer.prev){
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

    deleteBranch(node){
        this.pointer.deleteNext(node);
    }
    changeBranchOrder(pos, delta){
        this.pointer.changeNextOrder(pos, delta);
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
            this.board.pass(this.history);

            if(this.history.getCurrentNode().isSecondConsecutivePass()){
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
            this.history.pushResign(this.board.koPos, this.getTurn()); //keep koPos, do not rotate a turn
        }
    }

    // Foeced Change (for setup properties)

    setTurnForced(color){
        if(!isValidColor(color)){
            return false;
        }
        this.board.setTurn(color);
        return true;
    }
    setIntersectionStateForced(pos, state){
        if(this.board.isValidPosition(pos)){
            this.board.setAt(pos, state);
        }
        return true;
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

    toSGF(opt){
        return HistoryTreeString.toSGF(this, opt);
    }

    static fromSGF(str){
        return HistoryTreeString.fromSGF(str);
    }
}
igo.Game = Game;


//
// SGF
//
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
igo.parseSGFPointXY = parseSGFPointXY;
function parseSGFText(value){
    return value.replace(/\\(\n\r?|\r\n?)/gi, "").replace(/\\(.)/gi, "$1").replace(/\t\v/gi, " ");
}
function parseSGFSimpleText(value){
    return value.replace(/\\(\n\r?|\r\n?)/gi, "").replace(/\\(.)/gi, "$1").replace(/(\t|\v|\n\r?|\r\n?)/gi, " ");
}


// stringize

function toSGFPointLetter(n){
    if(!(n >= 0 && n <= 51)){
        throw new Error("SGF coordinates out of range : " + n);
    }
    // 0~25:a~z(0x61~)
    //26~51:A~Z(0x41~)
    return String.fromCharCode(n<26 ? 0x61+n : 0x41-26+n);
}
function toSGFPointXY(x, y){
    return toSGFPointLetter(x) + toSGFPointLetter(y);
}
igo.toSGFPointXY = toSGFPointXY;

function toSGFPoint(pos, board){
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


// SGF propertis

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



//
// Stringify
//

function btoaSafe(b){
    return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "."); //url safe base64
}
function atobSafe(a){
    return atob(a.replace(/-/g, "+").replace(/_/g, "/").replace(/\./g, "="));
}

function BitWriter(){
    let str = "";
    let byte = 0;
    let bitIndex = 0;
    function put(value, bitWidth){
        while(bitWidth > 8){
            put8(value & 255, 8);
            value >>>= 8;
            bitWidth -= 8;
        }
        put8(value, bitWidth);
    }
    function put8(value, bitWidth){
        value &= (1<<bitWidth)-1;
        const boundary = 8 - bitIndex;
        byte |= (value & ((1 << boundary)-1)) << bitIndex;
        bitIndex += bitWidth;
        if(bitIndex >= 8){
            str += String.fromCharCode(byte);
            bitIndex -= 8;
            byte = value >> boundary;
        }
    }
    function flush(){
        if(bitIndex > 0){
            str += String.fromCharCode(byte);
            byte = 0;
            bitIndex = 0;
        }
        const result = str;
        str = "";
        return result;
    }
    this.put = put;
    this.flush = flush;
}

function BitReader(str, strIndex){
    if(strIndex === undefined){
        strIndex = 0;
    }
    let byte = str.charCodeAt(strIndex++);
    let bitIndex = 0;
    function get(bitWidth){
        if(bitWidth <= 8){
            return get8(bitWidth);
        }
        else{
            let pos = 0;
            let value = 0;
            while(bitWidth > 8){
                value |= get8(8)<<pos;
                pos += 8;
                bitWidth -= 8;
            }
            value |= get8(bitWidth) << pos;
            return value;
        }
    }
    function get8(bitWidth){
        const boundary = 8 - bitIndex;
        let value = (byte >> bitIndex) & ((1<<bitWidth)-1);
        bitIndex += bitWidth;
        if(bitIndex >= 8){
            byte = str.charCodeAt(strIndex++);
            bitIndex -= 8;
            value |= (byte & ((1<<bitIndex)-1)) << boundary;
        }
        return value;
    }
    this.get = get;
}


// 盤面の交点を文字列へ変換し、または文字列から戻すためのクラスです。
class BoardStringizer{
    static to20Per32bits(board){
        // 3^20 = 0xcfd41b91
        const size = board.getIntersectionCount();
        let str = "";
        for(let pos = 0; pos < size; pos += 20){
            let dw = 0;
            for(let i = Math.min(20, size-pos)-1; i >= 0; --i){
                dw = dw * 3 + board.getAt(pos+i);
            }
            str += String.fromCharCode(
                dw&255,
                (dw>>>8)&255,
                (dw>>>16)&255,
                (dw>>>24)&255);
        }
        return btoaSafe(str);
    }
    static from20Per32bits(b64str){
        const str = atobSafe(b64str);
        const intersections = [];
        for(let si = 0; si < str.length; si += 4){
            let dw =
                str.charCodeAt(si) +
                (si+1<str.length ? (str.charCodeAt(si+1)<<8) : 0) +
                (si+2<str.length ? (str.charCodeAt(si+2)<<16) : 0) +
                (si+3<str.length ? (str.charCodeAt(si+3)*(1<<24)) : 0);
            for(let i = 0; i < 20; ++i){
                intersections.push(dw % 3);
                dw = Math.floor(dw / 3);
            }
        }
        return intersections;
    }

    static toHumanReadable(board){
        const MARKS = ".xo";
        let str = "";
        const size = board.getIntersectionCount();
        for(let pos = 0; pos < size; ++pos){
            str += MARKS[board.getAt(pos)];
        }
        return str;
    }
    static fromHumanReadable(str){
        const MARKS = ".xo";
        const STATES = [EMPTY, BLACK, WHITE];
        const intersections = [];
        for(let pos = 0; pos < str.length; ++pos){
            const state = MARKS.indexOf(str.charAt(pos));
            intersections.push(state >= 0 ? STATES[state] : EMPTY);
        }
        return intersections;
    }
}
igo.BoardStringizer = BoardStringizer;


//
// HistoryTreeString
//

class HistoryTreeFormatter{
    toString(){}
    beginTree(turn){}
    endTree(turn){}
    putResign(turn){}
    putPass(turn){}
    putPlace(pos, turn){}
    putSetupNode(node, turn){}
    putSetupProperty(setup, turn){}
    putMarks(marks){}
    putComment(comment){}
    beginBranch(node, turn){}
    endBranch(node, turn){}
}

const HTS_CMD_PASS = 0;
const HTS_CMD_BEGIN_BRANCH = 1;
const HTS_CMD_END_BRANCH = 2;
const HTS_CMD_SPECIAL = 3;
const HTS_CMD_UPPER = 4;
const HTS_SUBCMD_RESIGN = 1;
const HTS_SUBCMD_SETUP = 2;
const HTS_BITWIDTH_SUBCMD = 6;

class HistoryTreeBase64Formatter extends HistoryTreeFormatter{
    constructor(board){
        super();

        this.board = board;
        this.boardSize = board.w * board.h;
        this.bitWriter = new BitWriter();
        this.bitWidth = Math.ceil(Math.log2(this.boardSize + HTS_CMD_UPPER));
    }

    putPos(pos){
        this.bitWriter.put(pos, this.bitWidth);
    }
    putCmd(cmd){
        this.bitWriter.put(this.boardSize + cmd, this.bitWidth);
    }
    putSubCmd(subcmd){
        this.putCmd(HTS_CMD_SPECIAL);
        this.bitWriter.put(subcmd, HTS_BITWIDTH_SUBCMD);
    }

    // override

    toString(){
        return btoaSafe(this.bitWriter.flush());
    }

    beginTree(turn){}//ルートのbeginBranch()は省略。
    endTree(turn){this.endBranch(turn);}//終端のために必要
    putPlace(pos, turn){this.putPos(pos);}
    putPass(turn){this.putCmd(HTS_CMD_PASS);}
    putResign(turn){this.putSubCmd(HTS_SUBCMD_RESIGN);}
    beginBranch(node, turn){this.putCmd(HTS_CMD_BEGIN_BRANCH);}
    endBranch(node, turn){this.putCmd(HTS_CMD_END_BRANCH);}

    putSetupProperty(setup, turn){
        this.putSubCmd(HTS_SUBCMD_SETUP);
        if(setup.intersections){
            this.bitWriter.put(1, 1);
            // 色別、点・矩形別に分類する。
            const states = [
                {points:[], rects:[]}, //EMPTY
                {points:[], rects:[]}, //BLACK
                {points:[], rects:[]}]; //WHITE
            for(const change of setup.getCompressedIntersectionChanges(this.board)){
                const stateIndex = getIndexOfEmptyBlackWhite(change.state);
                if(change.left == change.right && change.top == change.bottom){
                    states[stateIndex].points.push(change);
                }
                else{
                    states[stateIndex].rects.push(change);
                }
            }
            // 色別、点・矩形別に出力する。
            for(let si = 0; si < 3; ++si){
                for(let change of states[si].points){
                    this.putPos(this.board.toPosition(change.left, change.top));
                }
                this.putPos(this.boardSize);
                for(let change of states[si].rects){
                    this.putPos(this.board.toPosition(change.left, change.top));
                    this.putPos(this.board.toPosition(change.right, change.bottom));
                }
                this.putPos(this.boardSize);
            }
        }
        else{
            this.bitWriter.put(0, 1);
        }
        if(setup.turn && setup.turn.newTurn != turn){
            this.bitWriter.put(1, 1);
            this.bitWriter.put(setup.turn.newTurn == BLACK ? 0 : 1, 1);
            turn = setup.turn.newTurn;
        }
        else{
            this.bitWriter.put(0, 1);
        }
    }
}

class HistoryTreeHumanReadableFormatter extends HistoryTreeFormatter{
    constructor(board){
        super();

        this.str = "";
        this.board = board;
    }

    putPos(pos){
        this.str += toSGFPoint(pos, this.board);
    }
    putCmd(cmd){
        switch(cmd){
        case HTS_CMD_PASS: this.str += "-P"; break;
        case HTS_CMD_BEGIN_BRANCH: this.str += "-B"; break;
        case HTS_CMD_END_BRANCH: this.str += "."; break;
        }
    }
    putSubCmd(subcmd){
        switch(subcmd){
        case HTS_SUBCMD_RESIGN: this.str += "-R"; break;
        case HTS_SUBCMD_SETUP: this.str += "-S"; break;
        }
    }

    // override

    toString(){
        return this.str;
    }

    beginTree(turn){}//ルートのbeginBranch()は省略。
    endTree(turn){this.endBranch(turn);}//終端のために必要
    putPlace(pos, turn){this.str += "_"; this.putPos(pos);}
    putPass(turn){this.putCmd(HTS_CMD_PASS);}
    putResign(turn){this.putSubCmd(HTS_SUBCMD_RESIGN);}
    beginBranch(node, turn){this.putCmd(HTS_CMD_BEGIN_BRANCH);}
    endBranch(node, turn){this.putCmd(HTS_CMD_END_BRANCH);}

    putSetupProperty(setup, turn){
        this.putSubCmd(HTS_SUBCMD_SETUP);
        if(setup.intersections){
            this.str += "I";
            // 色別、点・矩形別に分類する。
            const states = [
                {points:[], rects:[]}, //EMPTY
                {points:[], rects:[]}, //BLACK
                {points:[], rects:[]}]; //WHITE
            for(const change of setup.getCompressedIntersectionChanges(this.board)){
                const stateIndex = getIndexOfEmptyBlackWhite(change.state);
                if(change.left == change.right && change.top == change.bottom){
                    states[stateIndex].points.push(change);
                }
                else{
                    states[stateIndex].rects.push(change);
                }
            }
            // 色別、点・矩形別に出力する。
            for(let si = 0; si < 3; ++si){
                for(let change of states[si].points){
                    this.putPos(this.board.toPosition(change.left, change.top));
                }
                this.str += ".";
                for(let change of states[si].rects){
                    this.putPos(this.board.toPosition(change.left, change.top));
                    this.putPos(this.board.toPosition(change.right, change.bottom));
                }
                this.str += ".";
            }
        }
        if(setup.turn && setup.turn.newTurn != turn){
            this.str += "T";
            this.str += setup.turn.newTurn == BLACK ? "B" : "W";
        }
        this.str += "--";
    }
}

class HistoryTreeSGFFormatter extends HistoryTreeFormatter {
    constructor(board){
        super();
        this.board = board;
        this.str = "";
    }

    toString(){
        return this.str;
    }

    beginTree(turn){
        this.str += "(";
    }
    endTree(turn){
        this.str += ")";
    }

    beginBranch(node, turn){
        if(node.isResign() && node.nexts.length == 0){
            return; //ignore resign only branch
        }
        this.str += "(";
    }
    endBranch(node, turn){
        if(node.isResign() && node.nexts.length == 0){
            return; //ignore resign only branch
        }
        this.str += ")";
    }

    putResign(turn){
        // ignore
    }
    putPass(turn){
        this.str += ";" + toSGFColor(turn) +"[]";
    }
    putPlace(pos, turn){
        this.str += ";" + toSGFColor(turn) + "[" + toSGFPoint(pos, this.board) + "]";
    }
    putSetupNode(node, turn){
        this.str += ";";
        if(node.isRoot()){
            // Root Node
            let rootProperties =
                "GM[1]" +
                "SZ[" + (this.board.w == this.board.h ? this.board.w : this.board.w + ":" + this.board.h) + "]";

            // Game Info Properties (game-infoはRoot Nodeにしかない)
            for(const propType of SGF_GAME_INFO_PROPERTIES){
                if(node.hasProperty(propType.id)){
                    const propValue = node.getProperty(propType.id).value;
                    if(propType.type == "text"){
                        rootProperties += propType.id + "[" + toSGFText(propValue) + "]";
                    }
                    else{
                        rootProperties += propType.id + "[" + toSGFSimpleText(propValue) + "]";
                    }
                }
            }
            this.str += rootProperties;
        }
    }
    putSetupProperty(setup, turn){
        if(setup.intersections){
            for(const change of setup.getCompressedIntersectionChanges(this.board)){
                // AB, AW, AE
                this.str += "A" + toSGFColor(change.state) + "[" +
                    toSGFPointXY(change.left, change.top) +
                    (change.left != change.right || change.top != change.bottom ?
                     ":" + toSGFPointXY(change.right, change.bottom) : "") + "]";
            }
        }
        if(setup.turn && setup.turn.newTurn != turn){
            this.str += "PL[" + toSGFColor(setup.turn.newTurn) + "]";
            turn = setup.turn.newTurn;
        }
    }
    putMarks(marks){
        for(const mark of marks){
            if(mark.type == "text"){
                this.str += "LB["  + toSGFPoint(mark.pos, this.board) + ":" + toSGFSimpleText(mark.text) + "]";
            }
            else{
                const pid =
                      mark.type == "circle" ? "CR" :
                      mark.type == "triangle" ? "TR" :
                      mark.type == "square" ? "SQ" :
                      mark.type == "cross" ? "MA" :
                      "MA";
                this.str += pid + "[" + toSGFPoint(mark.pos, this.board) + "]";
            }
        }
    }
    putComment(comment){
        this.str += "C[" + toSGFText(comment) + "]";
    }
}

class HistoryTreeString {
    static toString(game, opt, format){
        if(!opt){ opt = {};}
        const board = game.board;
        const history = game.history;

        // determine start node
        let startNode;
        if(opt.fromCurrentNode){
            // make setup property
            const emptyBoard = new Board(board.w, board.h);
            const boardChanges = BoardDiff.diff(emptyBoard, board);
            // clone current node
            startNode = history.getCurrentNode().shallowClone();
            startNode.prev = null;
            startNode.pos = NPOS;
            startNode.boardUndo = null;
            startNode.setSetup(boardChanges); //setSetupはclone元の状態を変更しない、はず。
        }
        else{
            startNode = history.getRootNode();
        }
        let turn = BLACK;

        // output tree
        format.beginTree(turn);
        if(opt.toCurrentNode){
            if(opt.fromCurrentNode){
                // output current node only
                putNode(startNode);
            }
            else{
                // output straight path from root node to current node
                const nodes = [];
                for(let node = history.getCurrentNode(); node; node = node.prev){
                    nodes.push(node);
                }
                nodes.reverse();
                for(const node of nodes){
                    putNode(node);
                }
            }
        }
        else{
            // output all nodes in the tree
            startNode.visitAllNodes(
                (node)=>{ //enter
                    if(node.getNumberOfSiblings() > 1){
                        format.beginBranch(node, turn);
                    }
                    putNode(node);
                },
                (node)=>{ //leave
                    if(node.getNumberOfSiblings() > 1){
                        format.endBranch(node, turn);
                    }
                    if(node.setup && node.setup.turn){
                        turn = node.setup.turn.oldTurn;
                    }
                    else{
                        if(node.isPass() || node.isPlace()){
                            turn = getOppositeColor(turn);
                        }
                    }
                });
        }
        format.endTree(turn);
        return format.toString();

        function putNode(node){
            if(node.isResign()){
                format.putResign(turn);
            }
            else if(node.isPass()){
                format.putPass(turn);
                turn = getOppositeColor(turn);
            }
            else if(node.isPlace()){
                format.putPlace(node.pos, turn);
                turn = getOppositeColor(turn);
            }
            else{
                format.putSetupNode(node, turn);
            }

            if(node.hasSetup()){
                const setup = node.getSetup();
                format.putSetupProperty(setup, turn);
                if(setup.turn && setup.turn.newTurn != turn){
                    turn = setup.turn.newTurn;
                }
            }
            if(node.hasProperty("marks")){
                const marks = node.getProperty("marks").value;
                if(marks){
                    format.putMarks(marks, turn);
                }
            }
            if(node.hasComment()){
                format.putComment(node.getComment(), turn);
            }
        }
    }

    static toBase64(game, opt){
        return HistoryTreeString.toString(game, opt, new HistoryTreeBase64Formatter(game.board));
    }
    static toHumanReadable(game, opt){
        return HistoryTreeString.toString(game, opt, new HistoryTreeHumanReadableFormatter(game.board));
    }
    static toSGF(game, opt){
        return HistoryTreeString.toString(game, opt, new HistoryTreeSGFFormatter(game.board));
    }


    static fromBase64(b64str, w, h){
        const bitReader = new BitReader(atobSafe(b64str));
        const boardSize = w * h;
        const bitWidth = Math.ceil(Math.log2(boardSize + HTS_CMD_UPPER)); //min bit width that can represent positions and commands

        function readPos() {return bitReader.get(bitWidth);}
        function readSubCmd() {return bitReader.get(HTS_BITWIDTH_SUBCMD);}
        function read1Bit() {return bitReader.get(1);}

        const game = new Game(w, h);
        const board = game.board;

        const nodeStack = [];
        for(;;){
            const pos = readPos();
            if(pos >= 0 && pos < boardSize){
                if(!game.putStone(pos)){
                    console.log("illegal move " + pos);
                    return null; //illegal move
                }
            }
            else{
                const cmd = pos - boardSize;
                switch(cmd){
                case HTS_CMD_PASS: game.pass(); break;
                case HTS_CMD_BEGIN_BRANCH:
                    nodeStack.push(game.history.getCurrentNode());
                    break;
                case HTS_CMD_END_BRANCH:
                    if(nodeStack.length == 0){
                        game.history.undoAll(board, game);
                        return game; //end of tree
                    }
                    else{
                        game.history.undoTo(nodeStack.pop(), board, game);
                    }
                    break;
                case HTS_CMD_SPECIAL:
                    {
                        const subcmd = readSubCmd();
                        switch(subcmd){
                        case HTS_SUBCMD_RESIGN: game.resign(); break;
                        case HTS_SUBCMD_SETUP: procSetup(); break;
                        default:
                            console.log("unknown subcmd " + subcmd);
                            return null; //unknown subcmd
                        }
                    }
                    break;
                default:
                    console.log("unknown cmd " + pos - boardSize);
                    return null; //unknown cmd
                }
            }
        }
        return game;

        function procSetup(){
            // Add new empty node
            if(! (game.history.getCurrentNode().isRoot() && nodeStack.length == 0)){
                game.history.pushSetupNode(board.koPos); ///@todo keep koPos? or not?
            }
            // Add setup property
            const setup = game.history.getCurrentNode().acquireSetup();
            // setup intersections
            if(read1Bit() != 0){
                const states = [EMPTY, BLACK, WHITE];
                for(let si = 0; si < 3; ++si){
                    const newState = states[si];
                    // points
                    for(;;){
                        const pos = readPos();
                        if(pos >= boardSize){
                            break;
                        }
                        if(board.isValidPosition(pos)){
                            const oldState = board.getAt(pos);
                            setup.addIntersectionChange(pos, oldState, newState);
                            game.setIntersectionStateForced(pos, newState);
                        }
                    }
                    // rectangles
                    for(;;){
                        const posLeftTop = readPos();
                        if(posLeftTop >= boardSize){
                            break;
                        }
                        const posRightBottom = readPos();
                        const left = board.toX(posLeftTop);
                        const top = board.toY(posLeftTop);
                        const right = board.toX(posRightBottom);
                        const bottom = board.toY(posRightBottom);
                        for(let y = top; y <= bottom; ++y){
                            for(let x = left; x <= right; ++x){
                                const pos = board.toPosition(x, y);
                                const oldState = board.getAt(pos);
                                setup.addIntersectionChange(pos, oldState, newState);
                                game.setIntersectionStateForced(pos, newState);
                            }
                        }
                    }
                }
            }
            // setup turn
            if(read1Bit() != 0){
                const newTurn = read1Bit() == 0 ? BLACK : WHITE;
                const oldTurn = game.getTurn();
                setup.setTurnChange(oldTurn, newTurn);
                game.setTurnForced(newTurn);
            }
        }
    }

    static fromHumanReadable(str, w, h){
        let strIndex = 0;
        function scan(){return str[strIndex];}
        function get(){return str[strIndex++];}
        function readPos() {
            const c1 = get();
            const c2 = get();
            return parseSGFPoint(c1 + c2, w, h);
        }

        const game = new Game(w, h);
        const board = game.board;

        const nodeStack = [];
        for(;;){
            const prefix = get();
            if(prefix == "_"){
                const pos = readPos();
                if(!game.putStone(pos)){
                    console.log("illegal move " + pos);
                    return null; //illegal move
                }
            }
            else if(prefix == "-"){
                const cmd = get();
                switch(cmd){
                case "P": game.pass(); break;
                case "B": nodeStack.push(game.history.getCurrentNode()); break; // begin branch
                case "R": game.resign(); break;
                case "S": procSetup(); break;
                default: return null;
                }
            }
            else if(prefix == "."){
                // end branch
                if(nodeStack.length == 0){
                    game.history.undoAll(board, game);
                    return game; //end of tree
                }
                else{
                    game.history.undoTo(nodeStack.pop(), board, game);
                }
            }
        }
        return game;

        function procSetup(){
            // Add new empty node
            if(! (game.history.getCurrentNode().isRoot() && nodeStack.length == 0)){
                game.history.pushSetupNode(board.koPos); ///@todo keep koPos? or not?
            }
            // Add setup property
            const setup = game.history.getCurrentNode().acquireSetup();
            // setup intersections
            if(scan() == "I"){
                get();
                const states = [EMPTY, BLACK, WHITE];
                for(let si = 0; si < 3; ++si){
                    const newState = states[si];
                    // points
                    for(;;){
                        if(scan() == "." || scan() == ""){
                            get();
                            break;
                        }
                        const pos = readPos();
                        if(board.isValidPosition(pos)){
                            const oldState = board.getAt(pos);
                            setup.addIntersectionChange(pos, oldState, newState);
                            game.setIntersectionStateForced(pos, newState);
                        }
                    }
                    // rectangles
                    for(;;){
                        if(scan() == "." || scan() == ""){
                            get();
                            break;
                        }
                        const posLeftTop = readPos();
                        const posRightBottom = readPos();
                        const left = board.toX(posLeftTop);
                        const top = board.toY(posLeftTop);
                        const right = board.toX(posRightBottom);
                        const bottom = board.toY(posRightBottom);
                        for(let y = top; y <= bottom; ++y){
                            for(let x = left; x <= right; ++x){
                                const pos = board.toPosition(x, y);
                                const oldState = board.getAt(pos);
                                setup.addIntersectionChange(pos, oldState, newState);
                                game.setIntersectionStateForced(pos, newState);
                            }
                        }
                    }
                }
            }
            // setup turn
            if(scan() == "T"){
                get();
                const newTurn = get() == "B" ? BLACK : WHITE;
                const oldTurn = game.getTurn();
                setup.setTurnChange(oldTurn, newTurn);
                game.setTurnForced(newTurn);
            }
            if(get() != "-" || get() != "-"){
                throw new Error("setup node not terminated");
            }
        }
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
                let setup = false;
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
                            if(setup){
                                throw new Error("Cannot mix move properties and setup properties");
                            }
                            moved = true;
                            const move = pvalues[0];
                            const color = pid == "B" ? BLACK : WHITE;
                            if(game.getTurn() != color){
                                // 詰碁のSGFでPLなしにWから始まるものがあるので初手だけは許可する。
                                if( game.getMoveNumber() > 0){
                                    throw new Error("Unexpected player change " + pid + " " + move);
                                }
                                game.history.getCurrentNode().acquireSetup().setTurnChange(game.getTurn(), color); //着手前なのでおそらくルートノード
                                game.setTurnForced(color);
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
                    case "PL":
                        if(moved){
                            throw new Error("Cannot mix setup properties and move properties");
                        }
                        // prepare setup property(BoardDiff)
                        if(!setup){
                            // add node
                            if(!game.history.getCurrentNode().isSetup()){
                                game.history.pushSetupNode(game.board.koPos); ///@todo keep koPos? or not?
                            }
                            // add setup property
                            setup = game.history.getCurrentNode().acquireSetup();
                        }
                        if(pid == "AB" || pid == "AW" || pid == "AE"){
                            //change intersection
                            for(const value of pvalues){
                                const points = parseSGFComposedPoint(value, w, h);
                                for(const pos of points){
                                    if(isValidPosition(pos, w, h)){
                                        const oldState = game.board.getAt(pos);
                                        const newState = pid == "AB" ? BLACK : pid == "AW" ? WHITE : EMPTY;
                                        setup.addIntersectionChange(pos, oldState, newState);
                                        game.setIntersectionStateForced(pos, newState);
                                    }
                                }
                            }
                        }
                        else if(pid == "PL"){
                            //change turn
                            const newTurn = pvalues[0] == "B" ? BLACK : pvalues[0] == "W" ? WHITE : EMPTY;
                            if(newTurn == EMPTY){
                                throw new Error("Invalid color " + pid + " " + pvalues[0]);
                            }
                            const oldTurn = game.getTurn();
                            setup.setTurnChange(oldTurn, newTurn);
                            game.setTurnForced(newTurn);
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
igo.HistoryTreeString = HistoryTreeString;

})();

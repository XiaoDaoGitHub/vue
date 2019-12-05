function *foo(y) {
    let x = yield 12;
    console.log(x)
}

let x = foo(5)
console.log(x)
console.log(x.next(6))
x.next(6)
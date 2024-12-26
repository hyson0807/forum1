// npm init -y
//라이브러리 사용을 위해 세팅
//npm install express 
//익스프레스 라이브러리 설치
const express = require('express')
const path = require('path')
const app = express()
const { MongoClient, ObjectId } = require('mongodb')
const methodOverride = require('method-override')
const bcrypt = require('bcrypt')
require('dotenv').config()

app.use(methodOverride('_method'))
app.use(express.static(__dirname + '/public'))
app.set('view engine', 'ejs')
app.use(express.json())
app.use(express.urlencoded({extended:true}))

const session = require('express-session')
const passport = require('passport')
const LocalStrategy = require('passport-local')
const { render } = require('ejs')
const MongoStore = require('connect-mongo')


app.use(passport.initialize())
app.use(session({
  secret: '암호화에 쓸 비번',
  resave : false,
  saveUninitialized : false,
  cookie : { maxAge : 60 * 60 * 1000 },
  store : MongoStore.create({
    mongoUrl : 'mongodb+srv://admin:qwer1234@cluster0.7ubud.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
    dbName : 'forum'
  })
}))

app.use(passport.session()) 

app.use('/list', (요청, 응답, next) => {
    console.log(new Date())
    next()
})

const { S3Client } = require('@aws-sdk/client-s3')
const multer = require('multer')
const multerS3 = require('multer-s3')
const s3 = new S3Client({
  region : 'ap-northeast-2',
  credentials : {
      accessKeyId : process.env.Access_KEY,
      secretAccessKey : process.env.Secret_KEY
  }
})

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'hysonforum1',
    key: function (요청, file, cb) {
      cb(null, Date.now().toString()) //업로드시 파일명 변경가능
    }
  })
})

let connectDB = require('./database.js')

let db
connectDB.then((client)=>{
  console.log('DB연결성공')
  db = client.db('forum')
  app.listen(process.env.PORT, () => {
    console.log('http://localhost:8080 에서 서버 실행중')
})
}).catch((err)=>{
  console.log(err)
})

function checkLogin(요청, 응답, next) {
    if(!요청.user) {
        응답.redirect('/loginpage');
        
    }
    else {
        next()
    }
}
app.get('/logout', (요청, 응답, next) => {
    요청.logout((err) => {
        if(err) {
            return 응답.status(500).send("로그아웃 에러");
        }
        응답.redirect('/')
    })
})

app.use( ['/list', '/write'], checkLogin)

app.get('/',(요청, 응답) => {
    응답.sendFile(__dirname + '/index.html')
})

app.get('/main', (요청, 응답) => {
    응답.render('main.ejs')
})


//콜백 함수 
app.get('/shop', function(요청, 응답) {
    응답.send('쇼핑페이지 입니다')
})

app.get('/list', async function(요청, 응답) {
    let result = await db.collection('post').find()
    .sort({ createdAt: -1})
    .toArray()
    // 응답.send(result[0].title) 
    응답.render('list.ejs', { 글목록 : result})
})



app.get('/write', (요청, 응답) => {
    응답.render('write.ejs')
})

app.post('/add', async(요청, 응답) => {
    upload.single('img1') (요청, 응답, async(err) => {
        if(err) return 응답.send('업로드 에러')

        else {
            try {
                if(요청.body.title == '' || 요청.body.content == '') {
                    응답.send('제목과 내용 모두 입력해주세요')
                } else {
                    
                        await db.collection('post').insertOne( {
                            title : 요청.body.title, 
                            content : 요청.body.content, 
                            img : 요청.file ? 요청.file.location : '', 
                            createdAt : new Date(),
                            user : 요청.user._id,
                            username : 요청.user.username
                        })
                    
                    
                    
                    응답.redirect('/list/1')
                }
            } catch(e) {
                console.log(e)
                응답.status(500).send('서버 에러 발생')
            }
        }
    })
    

})

app.get('/detail/:id', async(요청, 응답)=> {

    try {
        let result = await db.collection('post').findOne({ _id: new ObjectId(요청.params.id)})
        if(result == null) {
            응답.status(400).send('이상한 url 입력함')
        }
        응답.render('detail.ejs', {result : result})
        console.log(result)
    } catch(e) {
        console.log(e)
        응답.status(400).send('이상한 url 입력함')
    }
})

app.get('/edit/:id', async(요청, 응답)=> {
    let result = await db.collection('post').findOne( {
        _id : new ObjectId(요청.params.id),
        user : new ObjectId(요청.user._id)
    
    } )
    if(!result) {
        응답.send('수정불가')
    } else {
        응답.render('edit.ejs', {result : result});

    }
})

app.put('/change', async(요청, 응답) => {
    console.log(요청.body);
    try {
        if(요청.body.title == '' || 요청.body.content == '') {
            응답.send("내용을 입력해 주세요");
        } 
        else { 

            
                let result = await db.collection('post').updateOne({ _id : new ObjectId(요청.body.id)}, 
                {$set : { title : 요청.body.title, content : 요청.body.content, createdAt : new Date() }});
            
            
            응답.redirect('/list/1');
        }
    } catch {
        
        응답.status(500).send('서버 에러 발생')
    }

    // -2 증가시키키 
    //await db.collection('post').updateOne({ _id : 1}, {$inc : { like : -2}})  

    //await db.collection('post').updateMany({ _id : 1}, {$set : { like : 2}})  
    

    //like 항목이 10 이상인 document 전부 수정하는 법
    // await db.collection('post').updateMany({ like : {$gte : 10}}, {$set : { like : 2}})  gt gte lte lt ne 

})

app.delete('/delete', async(요청, 응답) => {
    
    console.log(요청.query)

    await db.collection('post').deleteOne({ 
        _id : new ObjectId(요청.query.docid),
        user : new ObjectId(요청.user._id)
    })
    응답.send('삭제 완료')
})
let count;
app.get('/list/:id', async(요청, 응답) => {
    
    if(요청.params.id == 1) {
         count  = await db.collection('post').count()
         count = Math.ceil(count / 5)
        console.log(count)     
    }
    

    try {
        
        let result = await db.collection('post').find({})
        .sort({ createdAt: -1})
        .skip((요청.params.id - 1)*5)
        .limit(5).toArray()
        응답.render('list.ejs', {글목록 : result, count : count, user : 요청.user._id.toString()})
        

        if(result.length == 0) {
            return 응답.redirect('/list/1')
        }

    } catch(err) {
        console.error(err);
        응답.status(500).send("서버 오류");
    }



    
})





app.get('/list/next/:id', async function(요청, 응답) {
    try {
        // 요청.params.id가 유효한지 확인
        if (!ObjectId.isValid(요청.params.id)) {
            return 응답.status(400).send("잘못된 ID");
        }

        // 데이터 조회
        let result = await db.collection('post')
            .find({ _id: { $gt: new ObjectId(요청.params.id) } })
            .sort({ createdAt: -1 })
            .limit(5)
            .toArray();

        // 결과가 비어있을 경우 처리
        if (result.length === 0) {
            return 응답.redirect('/list/1');
        }

        // 결과 렌더링
        응답.render('list.ejs', { 글목록: result, count : count });
    } catch (err) {
        console.error(err);
        응답.status(500).send("서버 오류");
    }
});



function 아이디비번체크 (요청, 응답, next) {
    if (요청.body.username == '' || 요청.body.password == '') {
      응답.send('그러지마세요')
    } else {
      next()
    }
  }
  
app.post('/register', 아이디비번체크, async(요청, 응답) => {
    console.log(요청.body)
    let 해시 = await bcrypt.hash(요청.body.password, 10)
    console.log(해시)

    db.collection('user').insertOne({
        username : 요청.body.username, 
        password : 해시 
    })

    요청.logout((err) => {
        if(err) {
            return 응답.status(500).send("로그아웃 에러");
        }
        응답.redirect('/main')
    })
    // 응답.redirect('/list/1')
})

app.get('/register', (요청, 응답) => {
    응답.render('register.ejs')
})




passport.use(new LocalStrategy(async (입력한아이디, 입력한비번, cb) => {
    let result = await db.collection('user').findOne({ username : 입력한아이디})
    if (!result) {
      return cb(null, false, { message: '아이디 DB에 없음' })
    }

    
    if (await bcrypt.compare(입력한비번, result.password)) {
      return cb(null, result)
    } else {
      return cb(null, false, { message: '비번불일치' });
    }
  }))

  passport.serializeUser((user, done) => {
    process.nextTick(() => {
        done(null, { id : user._id ,  username : user.username})
    })
  })

  passport.deserializeUser(async (user, done) => {
    let result = await db.collection('user').findOne({_id : new ObjectId(user.id)})
    delete result.password
    process.nextTick(() => {
        done(null, result)
    })
  })



// app.get('/login', async function(요청, 응답) {
//     console.log(요청.user)
//     응답.render('login.ejs')
// })

// app.post('/login', 아이디비번체크 ,async function(요청, 응답, next) {
//     passport.authenticate('local', (error, user, info) => {
//         if(error) return 응답.status(500).json(error)
//         if(!user) return 응답.status(401).json(info.message)
//         요청.logIn(user, (err)=> {
//             if(err) return next(err)
//             응답.redirect('/list')    
//     })

//     })(요청, 응답, next)
    
// })

app.get('/mypage', async(요청, 응답) => {
    if(요청.user != null) {
        응답.render('mypage.ejs', {유저정보 : 요청.user})
    } else {
        응답.send("로그인 필요함")
    }
})

app.use('/shop', require('./routes/shop.js'))

app.get('/search', async (요청, 응답) => {
    let 검색조건 = [
      {$search : {
        index : 'title_index',
        text : { query : 요청.query.val, path : 'title' }
      }}
    ]
    let result = await db.collection('post').aggregate(검색조건).toArray()
    console.log(result)
    응답.render('search.ejs', { 글목록 : result })
  }) 

app.get('/loginpage', async(요청, 응답) => {
    
    응답.render('loginpage.ejs')
})

app.post('/loginpage', 아이디비번체크 ,async function(요청, 응답, next) {
    passport.authenticate('local', (error, user, info) => {
        if(error) return 응답.status(500).json(error)
        if(!user) return 응답.status(401).json(info.message)
        요청.logIn(user, (err)=> {
            if(err) return next(err)
            응답.redirect('/list/1')    
    })

    })(요청, 응답, next)
    
})












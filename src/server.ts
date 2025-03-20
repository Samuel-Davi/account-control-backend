import fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { Decimal } from "@prisma/client/runtime/library";
import bcrypt from "bcrypt"
import dotenv from "dotenv"
dotenv.config()


const app = fastify()

const prisma = new PrismaClient()

const SECRET = "chave_super_secreta";

//tipos e interfaces
type User = {
    id: number;
    email: string;
    avatarURL: string | null;
    deleteURL: string | null;
    name: string;
    password?: string;
    timeToken?: string;
    token?: string;
}

interface DecodedToken {
    id: number;
}

app.register(cors, {
    origin: ['https://account-control.vercel.app', 'http://localhost:3000'], // Permite apenas o Next.js no localhost
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true // Permite envio de cookies e autenticação
});

app.register(cookie, {
    hook: "onRequest",
});
  

app.get('/', (request, reply) => {
    return reply.status(201).send({ message: 'Hello, World!' })
})

app.get('/getUser', async (request, reply) => {

    try {
        // Obtém o token do cookie
        const authHeader = request.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1]
        if (!token) throw new Error("Token não encontrado");
    
        // Verifica e decodifica o token
        const decoded = jwt.verify(token, SECRET) as DecodedToken
    
        if (!decoded || !decoded.id) throw new Error("Token inválido");
    
        const user = await prisma.users.findUnique({
            where: {
                id: decoded.id,
            }
        })
    
        return reply.status(200).send({ user });
      } catch (error) {
        console.log("ta aqui o erro: ", error)
        return reply.status(401).send(({ error: "Não autorizado" }))
      }
})


//auth function
const setToken = async (mockUser:User, timeToken:string) => {
    if(timeToken === "1h"){
        return jwt.sign({ id: mockUser.id, email: mockUser.email }, SECRET, { expiresIn: "1h" });
    }else{
        return jwt.sign({ id: mockUser.id, email: mockUser.email }, SECRET, { expiresIn: "30d" });
    }
}
app.post('/auth', async (request, reply) => {
    const userSchema = z.object({
        email: z.string().email(),
        password: z.string(),
        timeToken: z.string()
    })

    const {email, password, timeToken} = userSchema.parse(request.body)

    const user:User|null = await prisma.users.findUnique({
        where: {
            email: email,
        },
    })

    if (!user){
        console.log("User not found")
        return reply.status(404).send({error: "Usuário não encontrado"})
    }

    const isPasswordValid = user.password && await bcrypt.compare(password, user.password);
    //console.log(isPasswordValid?.valueOf())

    if (email !== user.email || !isPasswordValid ){
        return reply.status(404).send({ error: "Usuário ou senha inválidos"});
    }

    const token = await setToken(user, timeToken)


    user.timeToken = timeToken
    user.token = token

    return reply.status(200).send({ user })

})

app.post('/signup', async (request, reply) => {
    const userSchema = z.object({
        email: z.string().email(),
        password: z.string(),
        name: z.string()
    })

    const {email, password, name} = userSchema.parse(request.body)

    const hashedPassword = await bcrypt.hash(password, 10);

    try{
        await prisma.users.create({
            data: {
                email: email,
                name: name,
                password: hashedPassword,
                avatarURL: ''
            }
        })
    }catch(error){
        console.log("Error ao cadastrar: ", error)
        return reply.status(400).send({ error: "Erro ao cadastrar o usuário"})
    }

    
    return reply.status(200).send({ message: "usuario criado com sucesso"})


})

//calculaSaldo functions
async function calculaGastos(id: number){
    const gastos = await prisma.transactions.findMany({
        where:{
            user_id: id,
            categories: {
                type: 'withdrawal'
            }
        }
    })
    let valor: Decimal = new Decimal(0); // Initialize valor with 0//+
    gastos.forEach((gasto) =>{
        valor = valor.add(gasto.amount) // Assign the result back to valor//+
    })
    return valor.toNumber()
}

async function calculaDepositos(id: number){
    const depositos = await prisma.transactions.findMany({
        where:{
            user_id: id,
            categories: {
                type: 'deposit'
            }
        }
    })
    let valor: Decimal = new Decimal(0); // Initialize valor with 0//+

    depositos.forEach((deposit) =>{
        valor = valor.add(deposit.amount) // Assign the result back to valor//+
    })
    return valor.toNumber()
}

app.get('/calculaSaldo', async (request, reply) => {
    try {
        const authHeader = request.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1]
        if (!token) throw new Error("Token não encontrado");
    
        // Verifica e decodifica o token
        const decoded = jwt.verify(token, SECRET) as DecodedToken;
        //console.log(decoded.id)
    
        if (!decoded || !decoded.id) throw new Error("Token inválido");

        //console.log("calculando saldo...")
        const gastos:number = await calculaGastos(decoded.id)
        const depositos:number = await calculaDepositos(decoded.id)
        const saldo:number = depositos-gastos
        //console.log("saldo: ", saldo)
        return reply.status(200).send({ saldo });
    } catch (error) {
        console.error('Erro ao acessar o banco de dados:', error);
        return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
})

//transacoes
app.get('/getTransactions', async (request, reply) => {

    try{
        const authHeader = request.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1]
        if (!token) throw new Error("Token não encontrado");
    
        // Verifica e decodifica o token
        const decoded = jwt.verify(token, SECRET) as DecodedToken;
    
        if (!decoded || !decoded.id) throw new Error("Token inválido");

        const transactions = await prisma.transactions.findMany({
            where:{
                user_id: decoded.id
            },
            orderBy: {
                transaction_date: 'desc'
            }
        })
        //console.log(transactions)
        return reply.status(200).send({ transactions })
    }catch(error){
        console.error('Erro ao acessar o banco de dados:', error);
        return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
})

app.post('/createTransaction', async (request, reply) => {
    try{
        const transactionSchema = z.object({
            user_id: z.number(),
            category_id: z.number(),
            description: z.string(),
            amount: z.number()
        })

        console.log("criando transação...")
    
        const {description, user_id, category_id, amount} =  transactionSchema.parse(request.body);
        //console.log(description, id, category_id, amount, transaction_date)
        const transaction = await prisma.transactions.create({
            data:{
                amount: amount,
                user_id: user_id,
                description: description,
                category_id: category_id,
            }
        })
        
        return reply.status(200).send( {transaction} )
    }catch(error){
        console.error('Erro ao atualizar transação:', error);
        return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
})

app.put('/updateTransaction', async (request, reply) => {

    try{
        const transactionSchema = z.object({
            id: z.number(),
            user_id: z.number(),
            category_id: z.number(),
            description: z.string(),
            amount: z.number(),
            transaction_date: z.string()
        })
        
        console.log("atualizando transação...")

        const {description, id, category_id, amount, transaction_date} =  transactionSchema.parse(request.body);
        //console.log(description, id, category_id, amount, transaction_date)
        const transaction = await prisma.transactions.update({
            where:{
                id: id
            },
            data:{
                amount: amount,
                description: description,
                category_id: category_id,
                transaction_date: transaction_date,
            }
        })
    
        return reply.status(200).send( {transaction} )
    }catch(error){
        console.error('Erro ao atualizar transação:', error);
        return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
})

app.delete('/deleteTransaction', async (request, reply) => {
    const { id } = request.query as { id?: string }

    console.log("deletando transação...")

    if (!id) {
        return reply.status(400).send({ message: 'ID é obrigatório' });
    }

    const deleteUser = await prisma.transactions.delete({
        where: {
            id: parseInt(id)
        }
    })
    return reply.status(200).send({ deleteUser })
})

//categories
app.get('/getCategories', async (request, reply) => {
    //console.log('Requisição de categorias recebida');
    try{
        const categories = await prisma.categories.findMany()
        //console.log(categories)
        return reply.status(200).send({ categories })
    }catch(error){
        console.error('Erro ao acessar o banco de dados:', error);
        return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
})

app.get('/getCategoriesByType', async (request, reply) => {
    const { type } = request.query as { type?: number }

    const typeCategories = type?.toString() === "0" ? "withdrawal" : "deposit"

    try{
        const categories = await prisma.categories.findMany({
            where: {
                type: typeCategories
            }
        })
        //console.log(categories)
        return reply.status(200).send({ categories })
    }catch(error){
        console.error('Erro ao acessar o banco de dados:', error);
        return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
})

//image
app.post('/upload', async (request, reply) => {
    console.log('uploading image...')

    try{
        const authHeader = request.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1]
        if (!token) throw new Error("Token não encontrado");
    
        // Verifica e decodifica o token
        const decoded = jwt.verify(token, SECRET) as DecodedToken

        const imageDataSchema = z.object({
            userId: z.number(),
            url : z.string(),
            deleteURL: z.string()
        })
        
        const {deleteURL, userId, url } = imageDataSchema.parse(request.body)
        console.log(deleteURL)

        await prisma.users.update({
            where: {
                id: userId
            },
            data:{
                avatarURL: url,
                deleteURL: deleteURL
            }
        })

        reply.status(200)
        
    }catch(error){
        console.error('Erro ao acessar o banco de dados:', error);
        return reply.status(500).send({ error: 'Erro interno do servidor' });
    }

})

app.listen({
    host: '0.0.0.0',
    port: process.env.PORT ? Number(process.env.PORT) : 8080
}).then(() => {
    console.log('http server running')
})
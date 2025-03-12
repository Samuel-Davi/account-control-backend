import fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { Decimal } from "@prisma/client/runtime/library";

const app = fastify()

const prisma = new PrismaClient()

const SECRET = "chave_super_secreta";

//tipos e interfaces
type User = {
    id: number;
    email: string;
    avatarURL: string;
    name: string;
    password?: string;
    timeToken?: string;
    token?: string;
}

interface DecodedToken {
    id: number;
}



app.register(fastifyCors, {
    origin: 'http://localhost:3000', // Permite apenas o Next.js no localhost
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true // Permite envio de cookies e autenticação
});

app.register(fastifyCookie);
  

app.get('/', (request, reply) => {
    return reply.status(201).send({ message: 'Hello, World!' })
})

app.get('/getUser', async (request, reply) => {
    const SECRET = "chave_super_secreta"; // 🔥 Alterar para variável de ambiente

    try {
        // Obtém o token do cookie
        const token = request.cookies.account_token
    
        //console.log("Token recebido no backend:", token);
        const users:Array<User> = await prisma.users.findMany()
    
        if (!token) throw new Error("Token não encontrado");
    
        // Verifica e decodifica o token
        const decoded = jwt.verify(token, SECRET) as DecodedToken;
    
        if (!decoded || !decoded.id) throw new Error("Token inválido");
    
        const user: User | undefined = users.find(u => u.id === decoded.id)
    
        return reply.status(200).send({ user });
      } catch (error) {
        console.log(error)
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

    if (email !== user.email || password !== user.password){
        return reply.status(401).send({ error: "Usuário ou senha inválidos"});
    }

    const token = await setToken(user, timeToken)

    reply.setCookie("account_token", token, {
        httpOnly: true,
        secure: true, // Importante para ambientes HTTPS (Render usa HTTPS)
        sameSite: "none", // Permite envio entre domínios diferentes
        path: "/",
        maxAge: timeToken === "1h"? 60*60 : 60*60*24*30,
    })

    user.timeToken = timeToken
    user.token = token

    return reply.status(200).send({ user })

})

//calculaSaldo functions
async function calculaGastos(){
    const gastos = await prisma.transactions.findMany({
        where:{
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

async function calculaDepositos(){
    const depositos = await prisma.transactions.findMany({
        where:{
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
        console.log("calculando saldo...")
        const gastos:number = await calculaGastos()
        const depositos:number = await calculaDepositos()
        const saldo:number = depositos-gastos
        console.log("saldo: ", saldo)
        return reply.status(200).send({ saldo });
    } catch (error) {
        console.error('Erro ao acessar o banco de dados:', error);
        return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
})

//transacoes
app.get('/getTransactions', async (request, reply) => {
    const transactions = await prisma.transactions.findMany({
        orderBy: {
            transaction_date: 'desc'
        }
    })
    //console.log(transactions)
    return reply.status(200).send({ transactions })
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
    const categories = await prisma.categories.findMany()
    //console.log(categories)
    return reply.status(200).send({ categories })
})

app.listen({
    host: '0.0.0.0',
    port: process.env.PORT ? Number(process.env.PORT) : 3333
}).then(() => {
    console.log('http server running')
})
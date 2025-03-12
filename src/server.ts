import fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

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
  

app.get('/', (request, reply) => {
    return reply.status(201).send({ message: 'Hello, World!' })
})

app.get('/getUser', async (request, reply) => {
    const SECRET = "chave_super_secreta"; // 🔥 Alterar para variável de ambiente

    try {
        // Obtém o token do cookie
        const token = request.cookies.token
        console.log(token) //+
    
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

    user.timeToken = timeToken
    user.token = token

    return reply.status(200).send({ user })

})

app.listen({
    host: '0.0.0.0',
    port: process.env.PORT ? Number(process.env.PORT) : 3333
}).then(() => {
    console.log('http server running')
})
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting basic seed...');

    // Create default admin user if not exists
    const adminUser = await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            password: '123', // In a real app, this should be hashed
            name: '管理员',
            role: 'ADMIN',
            permissions: JSON.stringify([])
        }
    });

    console.log(`Created/Updated admin user: ${adminUser.username}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

const { expect } = require("chai");

const { PollService } = require("./service");
const { AuthService } = require("../auth");
const { FakeIo } = require("../socket");

describe("modules", function () {
    describe("Poll Service", function () {
        beforeEach(function () {
            const io = this.io = new FakeIo(
                (eventName, ...args) => { },
                (socket, eventName, ...args) => { }
            );

            const auth = this.auth = new AuthService({ isLeader: () => false });
            const service = this.service = new PollService({ auth, io: this.io });
            const users = this.users = {};

            this.simulatePoll = async (...actions) => {
                for (const [username, type, options] of actions) {
                    let socket = users[username];
                    if (!socket)
                        users[username] = socket = io.createSocket({
                            nick: username,
                            type: username.startsWith("admin") ? 2 : 0,
                            ip: Math.random().toString()
                        });

                    if (type == "create")
                        await service.createPoll(socket, options);
                    else if (type == "cast")
                        await service.castVote(socket, options);
                }
            };
        });

        it("create normal poll with legacy string options", async function () {
            await this.simulatePoll(
                ["admin", "create", { ops: ["op1", "op2", "op3", "op4"], obscure: true, pollType: "normal" }],
                ["user1", "cast", { op: 0 }],
                ["user2", "cast", { op: 0 }],
                ["user3", "cast", { op: 1 }],
                ["user4", "cast", { op: 2 }]
            );

            const state = this.service.currentPoll.state

            expect(state.options).to.deep
                .equal(["op1", "op2", "op3", "op4"])

            expect(state.votes).to.deep
                .equal([2, 1, 1, 0])
        });

        it("create normal poll with new fancy options", async function () {
            await this.simulatePoll(
                ["admin", "create", {
                    ops: [
                        { text: "op1", isTwoThirds: true },
                        { text: "op2" },
                        { text: "op3", isTwoThirds: false },
                        { text: "op4" }
                    ], obscure: true, pollType: "normal"
                }],
                ["user1", "cast", { op: 0 }],
                ["user2", "cast", { op: 0 }],
                ["user3", "cast", { op: 1 }],
                ["user4", "cast", { op: 2 }]
            );

            const state = this.service.currentPoll.state

            expect(state.options).to.deep
                .equal(["op1 (2/3ds)", "op2", "op3", "op4"])

            expect(state.votes).to.deep
                .equal([2, 1, 1, 0])
        });

        it("create ranked poll with new fancy options", async function () {
            await this.simulatePoll(
                ["admin", "create", {
                    ops: [
                        { text: "op1", isTwoThirds: true },
                        { text: "op2" },
                        { text: "op3", isTwoThirds: false },
                        { text: "op4" }
                    ], obscure: true, pollType: "ranked"
                }],
                ["user1", "cast", { optionIndex: 0, rank: 0 }],
                ["user2", "cast", { optionIndex: 0, rank: 0 }],
                ["user3", "cast", { optionIndex: 1, rank: 0 }],
                ["user4", "cast", { optionIndex: 2, rank: 0 }]
            );

            const state = this.service.currentPoll.state
            const results = state.extended.results.map(r => ({ index: r.index, votes: r.votes }));

            expect(state.extended.options).to.deep
                .equal([
                    { text: "op1", isTwoThirds: true },
                    { text: "op2", isTwoThirds: false },
                    { text: "op3", isTwoThirds: false },
                    { text: "op4", isTwoThirds: false }
                ]);
                
            expect(state.options).to.deep
                .equal(["op1 (2/3ds)", "op2", "op3", "op4"])

            expect(results).to.deep
                .equal([
                    { index: 2, votes: 1 },
                    { index: 1, votes: 1 },
                    { index: 0, votes: 2 },
                    { index: 3, votes: 0 }
                ]);
        });

        it("create ranked poll when second runoff wins", async function () {
            await this.simulatePoll(
                ["admin", "create", {
                    ops: [
                        { text: "op1" },
                        { text: "op2" },
                        { text: "op3" },
                        { text: "op4" }
                    ], obscure: true, pollType: "ranked"
                }],
                ["user1", "cast", { optionIndex: 0, rank: 0 }], ["user1", "cast", { optionIndex: 2, rank: 1 }],
                ["user2", "cast", { optionIndex: 1, rank: 0 }], ["user2", "cast", { optionIndex: 2, rank: 1 }],
                ["user3", "cast", { optionIndex: 2, rank: 0 }],
                ["user4", "cast", { optionIndex: 2, rank: 0 }],
                ["user5", "cast", { optionIndex: 3, rank: 0 }],
                ["user6", "cast", { optionIndex: 3, rank: 0 }],
                ["user7", "cast", { optionIndex: 3, rank: 0 }]
            );

            const state = this.service.currentPoll.state;
            const results = state.extended.results.map(r => ({ index: r.index, votes: r.votes }));

            expect(results).to.deep
                .equal([
                    { index: 2, votes: 4 },
                    { index: 3, votes: 3 },
                    { index: 1, votes: 1 },
                    { index: 0, votes: 1 }
                ]);
        });

        it("create ranked poll when a two thirds option fails", async function () {
            await this.simulatePoll(
                ["admin", "create", {
                    ops: [
                        { text: "Two Thirds Loser", isTwoThirds: true },
                        { text: "Normal Winner" }
                    ], obscure: true, pollType: "ranked"
                }],
                ["user1", "cast", { optionIndex: 0, rank: 0 }],
                ["user2", "cast", { optionIndex: 0, rank: 0 }],
                ["user3", "cast", { optionIndex: 0, rank: 0 }],
                ["user4", "cast", { optionIndex: 0, rank: 0 }],
                ["user5", "cast", { optionIndex: 0, rank: 0 }],
                ["user6", "cast", { optionIndex: 1, rank: 0 }],
                ["user7", "cast", { optionIndex: 1, rank: 0 }],
                ["user8", "cast", { optionIndex: 1, rank: 0 }],
                ["user9", "cast", { optionIndex: 1, rank: 0 }],
            );

            const state = this.service.currentPoll.state;
            const results = state.extended.results.map(r => ({ index: r.index, votes: r.votes }));

            expect(results).to.deep
                .equal([
                    { index: 1, votes: 4 },
                    { index: 0, votes: 5 }
                ]);
        });

        it("create ranked poll when a two thirds option wins", async function () {
            await this.simulatePoll(
                ["admin", "create", {
                    ops: [
                        { text: "Two Thirds Winner", isTwoThirds: true },
                        { text: "Normal Winner" }
                    ], obscure: true, pollType: "ranked"
                }],
                ["user1", "cast", { optionIndex: 0, rank: 0 }],
                ["user2", "cast", { optionIndex: 0, rank: 0 }],
                ["user3", "cast", { optionIndex: 0, rank: 0 }],
                ["user4", "cast", { optionIndex: 0, rank: 0 }],
                ["user5", "cast", { optionIndex: 0, rank: 0 }],
                ["user6", "cast", { optionIndex: 0, rank: 0 }],
                ["user7", "cast", { optionIndex: 1, rank: 0 }],
                ["user8", "cast", { optionIndex: 1, rank: 0 }],
                ["user9", "cast", { optionIndex: 1, rank: 0 }],
            );

            const state = this.service.currentPoll.state;
            const results = state.extended.results.map(r => ({ index: r.index, votes: r.votes }));

            expect(results).to.deep
                .equal([
                    { index: 0, votes: 6 },
                    { index: 1, votes: 3 }
                ]);
        });

        it("create ranked poll when a user changes their vote so that a two thirds option wins", async function () {
            await this.simulatePoll(
                ["admin", "create", {
                    ops: [
                        { text: "Two Thirds Winner", isTwoThirds: true },
                        { text: "Normal Winner" }
                    ], obscure: true, pollType: "ranked"
                }],
                ["user1", "cast", { optionIndex: 0, rank: 0 }],
                ["user2", "cast", { optionIndex: 0, rank: 0 }],
                ["user3", "cast", { optionIndex: 0, rank: 0 }],
                ["user4", "cast", { optionIndex: 0, rank: 0 }],
                ["user5", "cast", { optionIndex: 0, rank: 0 }],
                ["user6", "cast", { optionIndex: 1, rank: 0 }],
                ["user7", "cast", { optionIndex: 1, rank: 0 }],
                ["user8", "cast", { optionIndex: 1, rank: 0 }],
                ["user9", "cast", { optionIndex: 1, rank: 0 }],
                ["user6", "cast", { optionIndex: 0, rank: 0 }],
            );

            const state = this.service.currentPoll.state;
            const results = state.extended.results.map(r => ({ index: r.index, votes: r.votes }));

            expect(results).to.deep
                .equal([
                    { index: 0, votes: 6 },
                    { index: 1, votes: 3 }
                ]);
        });

        it("create ranked poll when a two thirds option wins, but only after a runoff", async function () {
            await this.simulatePoll(
                ["admin", "create", {
                    ops: [
                        { text: "Two Thirds Winner", isTwoThirds: true },
                        { text: "Normal Winner" },
                        { text: "Shitfuck" }
                    ], obscure: true, pollType: "ranked"
                }],
                ["user1", "cast", { optionIndex: 0, rank: 0 }],
                ["user2", "cast", { optionIndex: 0, rank: 0 }],
                ["user3", "cast", { optionIndex: 0, rank: 0 }],
                ["user4", "cast", { optionIndex: 0, rank: 0 }],
                ["user5", "cast", { optionIndex: 0, rank: 0 }],
                ["user6", "cast", { optionIndex: 1, rank: 0 }],
                ["user7", "cast", { optionIndex: 1, rank: 0 }],
                ["user8", "cast", { optionIndex: 1, rank: 0 }],
                ["user9", "cast", { optionIndex: 2, rank: 0 }], ["user9", "cast", { optionIndex: 0, rank: 1 }]
            );

            const state = this.service.currentPoll.state;
            const results = state.extended.results.map(r => ({ index: r.index, votes: r.votes }));

            expect(results).to.deep
                .equal([
                    { index: 0, votes: 6 },
                    { index: 1, votes: 3 },
                    { index: 2, votes: 1 }
                ]);
        });

        it("create ranked poll when a two thirds option loses, even after a runoff", async function () {
            await this.simulatePoll(
                ["admin", "create", {
                    ops: [
                        { text: "Two Thirds Winner", isTwoThirds: true },
                        { text: "Normal Winner" },
                        { text: "Shitfuck" }
                    ], obscure: true, pollType: "ranked"
                }],
                ["user1", "cast", { optionIndex: 0, rank: 0 }],
                ["user2", "cast", { optionIndex: 0, rank: 0 }],
                ["user3", "cast", { optionIndex: 0, rank: 0 }],
                ["user4", "cast", { optionIndex: 0, rank: 0 }],
                ["user5", "cast", { optionIndex: 0, rank: 0 }],
                ["user6", "cast", { optionIndex: 1, rank: 0 }],
                ["user7", "cast", { optionIndex: 1, rank: 0 }],
                ["user8", "cast", { optionIndex: 1, rank: 0 }],
                ["userA", "cast", { optionIndex: 1, rank: 0 }],
                ["user9", "cast", { optionIndex: 2, rank: 0 }], ["user9", "cast", { optionIndex: 0, rank: 1 }]
            );

            const state = this.service.currentPoll.state;
            const results = state.extended.results.map(r => ({ index: r.index, votes: r.votes }));

            expect(results).to.deep
                .equal([
                    { index: 1, votes: 4 },
                    { index: 0, votes: 6 },
                    { index: 2, votes: 1 }
                ]);
        });
    });
});
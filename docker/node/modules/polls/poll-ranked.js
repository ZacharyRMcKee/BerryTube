const { PollInstance } = require("./poll-base");
const { events } = require("../log");

const resultCache = Symbol();
exports.RankedPoll = class extends PollInstance {
	get results() {
		if (!this[resultCache])
			this[resultCache] = this.calculateResults();

		return this[resultCache];
	}
	
	get state() {
		return {
			// legacy protocol
			// @TODO: version protocols properly
			creator: this.options.creator,
			title: this.options.title,
			obscure: this.options.isObscured,
			ghost: false,
			pollType: this.options.pollType,
			options: this.options.options.map(o => o.isTwoThirds ? `${o.text} (2/3ds)` : o.text),
			votes: [],

			extended: {
				options: this.options.options,
				results: this.results,
				votes: this.votes
			}
		};
	}

	get obscuredState() {
		return {
			...this.state,
			extended: { options: this.options.options }
		};
	}

	constructor(pollService, options, log) {
		super(pollService, options);
		this.votes = [];
		this.log = log;
		this[resultCache] = null;
	}

	castVote({ optionIndex, rank }, existingVote) {
		const vote = existingVote || { optionIndicies: [] };
		const sanitizedRank = parseInt(rank);

		if (sanitizedRank < 0 || sanitizedRank >= 3)
			throw new Error(`rank must be between 0 and 3`);

		const sanitizedIndex = parseInt(optionIndex);
		if (sanitizedIndex < 0 || sanitizedIndex >= this.options.options.length)
			throw new Error(`optionIndex must be a valid option index`);

		if (optionIndex !== null) {
			const existingIndex = vote.optionIndicies.findIndex(o => o == optionIndex);
			if (existingIndex != -1 && existingIndex != rank)
				throw new Error(`You cannot vote for an option twice`);
		}

		vote.optionIndicies[rank] = optionIndex;

		if (existingVote)
			this.votes[this.votes.indexOf(existingVote)] = vote;
		else
			this.votes.push(vote);

		this[resultCache] = null;
		return vote;
	}

	clearVote(vote) {
		const index = this.votes.indexOf(vote);
		if (index == -1)
			return

		this.votes.splice(index, 1);
		this[resultCache] = null;
	}

	calculateResults() {
		const { options: { options }, votes } = this;

		const finalVoteCounts = options.map((_, i) => ({
			votes: 0, 
			index: i, 
			isExcluded: false, 
			rankDistribution: [0, 0, 0], 
			opacity: .2
		}));
		
		const hasApplied = this.votes.map(v => v.optionIndicies.map(() => false));

		const finalResultsOrder = [];

		let finalMaxVote;
		
		if (votes.length == 0)
			return finalVoteCounts;

		const optionVoteTotalCount = options.map(() => 0);

		for (const vote of this.votes) {
			for (let rank = 0; rank < vote.optionIndicies.length; rank++) {
				const optionIndex = vote.optionIndicies[rank];
				if (typeof(optionIndex) === "undefined")
					continue;

				optionVoteTotalCount[optionIndex]++;
			}
		}

		let round = 0;

		while (true) {
			// tally up all votes, except for ones that are excluded
			const votesForOption = options.map((_, i) => ({votes: 0, index: i}));
			let totalVotesCast = 0;
			const hasVoted = this.votes.map(f => false);
			
			for (let voteIndex = 0; voteIndex < this.votes.length; voteIndex++) {
				const vote = this.votes[voteIndex];
				for (let rank = 0; rank < vote.optionIndicies.length; rank++) {
					const optionIndex = vote.optionIndicies[rank];
					if (typeof(optionIndex) === "undefined" || optionIndex === null)
						continue;
					
					const finalVoteObject = finalVoteCounts[optionIndex];
					if (!hasApplied[voteIndex][rank]) {
						finalVoteObject.rankDistribution[rank]++;
						hasApplied[voteIndex][rank] = true;
					}

					if (finalVoteObject.isExcluded)
						continue;

					if (!hasVoted[voteIndex]) {
						totalVotesCast++;
						votesForOption[optionIndex].votes++;
						hasVoted[voteIndex] = true;
					}
				}
			}

			let minVote = 50000;
			let maxVote = 0;
			let maxEligableVote = 0;
			const twoThirdsCutoff = (2 / 3) * totalVotesCast;

			for (let i = 0; i < votesForOption.length; i++) {
				if (finalVoteCounts[i].isExcluded)
					continue;

				const count = votesForOption[i].votes;
				minVote = Math.min(minVote, count);
				maxVote = Math.max(maxVote, count);

				const isEligable = 
					!options[i].isTwoThirds
					|| count >= twoThirdsCutoff

				if (isEligable)
					maxEligableVote = Math.max(maxEligableVote, count);
			}

			finalMaxVote = maxVote;

			// copy in the latest vote data into our finalVoteCounts
			let choppingBlock = [];
			for (let i = 0; i < votesForOption.length; i++) {
				const option = votesForOption[i];
				const finalData = finalVoteCounts[i];

				if (finalData.isExcluded)
					continue;

				// record the highest votes that an option ever got
				finalData.votes = Math.max(finalData.votes, option.votes);

				if (option.votes == maxEligableVote)
					continue;
				
				choppingBlock.push({ index: i, votes: option.votes });
			}

			// we are done if nothing was eliminated
			if (!choppingBlock.length) {
				// before we break, add our winners to the top of the result set
				for (let i = 0; i < votesForOption.length; i++) {
					if (finalVoteCounts[i].isExcluded)
						continue;

					finalResultsOrder.push(i);
				}
				
				break;
			}

			// choose an item to elimiate... prefer non-two third options
			const toEliminateIndex = choppingBlock.sort((l, r) => l.votes - r.votes)[0].index;
			finalResultsOrder.push(toEliminateIndex);
			finalVoteCounts[toEliminateIndex].isExcluded = true;

			// as a safegarud...
			if (++round > 300) {
				this.log.error(events.EVENT_RUNAWAY_CODE, "we spent {rounds} rounds on this poll :(", { round });
				throw new Error("Too much loop");
			}
		}
		
		// pre-calculate the target opacity
		for (let i = 0; i < finalVoteCounts.length; i++) {
			finalVoteCounts[i].opacity = Math.max(finalVoteCounts[i].votes / finalMaxVote, .2);
		}

		return finalResultsOrder.reverse().map(i => finalVoteCounts[i]);
	}
}
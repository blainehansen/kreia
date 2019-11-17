import 'mocha'
import { expect } from 'chai'

import { IterWrapper } from './utils'

function* nums() {
	yield* [1, 2, 3]
}

describe('IterWrapper', () => {
	it('create', () => {
		const a = IterWrapper.create(nums)
		expect(a.next()).eql(1)
		expect(a.next()).eql(2)
		expect(a.next()).eql(3)
		expect(a.next()).eql(undefined)
	})

	it('create_eternal', () => {
		const b = IterWrapper.create_eternal(nums)
		expect(b.next()).eql(1)
		expect(b.next()).eql(2)
		expect(b.next()).eql(3)
		expect(b.next()).eql(1)
		expect(b.next()).eql(2)
		expect(b.next()).eql(3)
		expect(b.next()).eql(1)
		expect(b.next()).eql(2)
		expect(b.next()).eql(3)
	})

	it('chain', () => {
		const c = IterWrapper.chain(IterWrapper.create(nums), IterWrapper.create(nums))
		expect(c.next()).eql(1)
		expect(c.next()).eql(2)
		expect(c.next()).eql(3)
		expect(c.next()).eql(1)
		expect(c.next()).eql(2)
		expect(c.next()).eql(3)
		expect(c.next()).eql(undefined)
	})

	it('clone', () => {
		const a = IterWrapper.create(nums)
		expect(a.next()).eql(1)
		const b = a.clone()
		expect(a.next()).eql(2)
		const c = a.clone()
		expect(a.next()).eql(3)
		expect(a.next()).eql(undefined)

		expect(c.next()).eql(3)
		expect(c.next()).eql(undefined)

		expect(b.next()).eql(2)
		const d = b.clone()
		expect(d.next()).eql(3)
		expect(d.next()).eql(undefined)

		expect(b.next()).eql(3)
		expect(b.next()).eql(undefined)
	})

	it('clone eternal', () => {
		const a = IterWrapper.create_eternal(nums)
		expect(a.next()).eql(1)
		const b = a.clone()
		expect(a.next()).eql(2)
		const c = a.clone()
		expect(a.next()).eql(3)
		expect(a.next()).eql(1)

		expect(c.next()).eql(3)
		expect(c.next()).eql(1)

		expect(b.next()).eql(2)
		const d = b.clone()
		expect(d.next()).eql(3)
		expect(d.next()).eql(1)

		expect(b.next()).eql(3)
		expect(b.next()).eql(1)
	})
})

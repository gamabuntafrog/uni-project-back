const paginationHelper = require('../../helpers/paginationDBHelper')
const getPagesCount = require('../../helpers/getPagesCount')
const User = require('../../models/user')
const getSortingQuery = require('../../helpers/getSortingQuery')
const { Types } = require('mongoose')

// Зробити матч перед facet DONE
// Зробити addFields після сортування якщо воно не по цьому полю DONE
// Поставити limit для nextEventDate DONE

// створити декілька агрегацій
// зробити пошук по полю creator

const getUsersSecond = async (req, res) => {
  const { currentUserId, query } = req

  const { sortBy, variant } = getSortingQuery(query)
  const { skip, limit } = paginationHelper(query)

  const sorting = {}

  if (sortBy) {
    sorting[sortBy] = variant
  }
}

const getUsers = async (req, res) => {
  // return await getUsersSecond(req, res)

  const { currentUserId, query } = req

  const { sortBy, variant } = getSortingQuery(query)
  const { skip, limit } = paginationHelper(query)

  const sorting = {}

  if (sortBy) {
    sorting[sortBy] = variant
  }

  const match = {
    _id: new Types.ObjectId(currentUserId)
  }

  const addNextEventDateField = {
    $addFields: {
      nextEventDate: {
        $ifNull: [
          {
            $first: '$events.startDate'
          },
          null
        ]
      }
    }
  }

  const pipeline = [
    {
      $match: match
    },
    {
      $lookup: {
        from: 'user_for_events',
        localField: 'usersForEvents',
        foreignField: '_id',
        as: 'usersForEvents'
      }
    },
    {
      $unwind: {
        path: '$usersForEvents',
        preserveNullAndEmptyArrays: false
      }
    },
    {
      $facet: {
        documents: [
          {
            $replaceRoot: {
              newRoot: '$usersForEvents'
            }
          },
          {
            $lookup: {
              from: 'user_events',
              localField: 'events',
              foreignField: '_id',
              as: 'events',
              pipeline: [
                { $match: { $expr: { $gte: ['$startDate', new Date()] } } },
                { $limit: 1 },
                { $project: { startDate: 1, endDate: 1 } }
              ]
            }
          },
          ...(sortBy
            ? [
                ...(sortBy === 'nextEventDate' ? [addNextEventDateField] : []),
                {
                  $sort: sorting
                }
              ]
            : []),
          {
            $skip: skip
          },
          {
            $limit: limit
          },
          ...(sortBy !== 'nextEventDate' ? [addNextEventDateField] : []),
          {
            $project: {
              username: 1,
              firstName: 1,
              lastName: 1,
              email: 1,
              nextEventDate: 1,
              eventsCount: 1,
              phoneNumber: 1
            }
          }
        ],
        countOfDocuments: [
          {
            $count: 'count'
          }
        ]
      }
    },
    {
      $project: {
        documents: 1,
        countOfNotFilteredDocuments: { $first: '$countOfDocuments.count' }
      }
    }
  ]

  const [{ documents, countOfNotFilteredDocuments }] = await User.aggregate(pipeline).exec()
  const pages = getPagesCount(countOfNotFilteredDocuments, limit)

  res.status(200).json({
    message: 'success',
    code: 200,
    data: {
      pages: pages,
      users: documents
    }
  })
}

module.exports = getUsers

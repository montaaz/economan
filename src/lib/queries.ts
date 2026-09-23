/** Requête partagée par l'économat et l'administration. */
export const DAY_BOARD_QUERY = /* GraphQL */ `
  query DayBoard($day: Date, $dayTo: Date) {
    dayBoard(day: $day, dayTo: $dayTo) {
      day
      dayTo
      isRange
      orderCount
      lineCount
      totalAsked
      totalServed
      pendingCount
      departments {
        department { id name code color icon }
        orderCount
        lineCount
        totalAsked
        totalServed
        orders {
          id
          reference
          ticketNumber
          businessDay
          status
          isUrgent
          createdAt
          acceptedAt
          deliveredAt
          receivedAt
          lastRefillRank
          # Les servis complémentaires : chacun a sa carte à côté du ticket.
          refills {
            id
            rank
            createdAt
            receivedAt
            deliveredAt
            receptionNote
            lineCount
            createdBy { fullName }
            receivedBy { fullName }
          }
          lineCount
          rejectedCount
          adjustedCount
          validatedCount
          receptionNote
          totalAsked
          totalServed
          createdBy { fullName }
        }
      }
    }
    activeDays(limit: 30)
  }
`

export const ORDER_QUERY = /* GraphQL */ `
  query Order($id: ID!) {
    order(id: $id) {
      id
      reference
      ticketNumber
      businessDay
      status
      isUrgent
      note
      createdAt
      acceptedAt
      deliveredAt
      receivedAt
      receptionNote
      lineCount
      lastRefillRank
      refills { id rank receivedAt deliveredAt receivedBy { fullName } }
      totalAsked
      totalServed
      department { id name code color icon }
      createdBy { fullName }
      processedBy { fullName }
      lines {
        id
        productId
        productName
        productRef
        categoryName
        unitSymbol
        stockFixe
        quantityOnHand
        quantityAsked
        quantityServed
        quantityRefilled
        refills { rank quantity }
        remaining
        status
        initialStatus
        rejectReason
        rang
      }
    }
  }
`

/** Les mêmes champs que ORDER_QUERY, pour plusieurs tickets en une requête. */
export const ORDERS_QUERY = /* GraphQL */ `
  query Orders($ids: [ID!]!) {
    orders(ids: $ids) {
      id
      reference
      ticketNumber
      businessDay
      status
      isUrgent
      note
      createdAt
      acceptedAt
      deliveredAt
      receivedAt
      receptionNote
      lineCount
      lastRefillRank
      refills { id rank receivedAt deliveredAt receivedBy { fullName } }
      totalAsked
      totalServed
      department { id name code color icon }
      createdBy { fullName }
      processedBy { fullName }
      lines {
        id
        productId
        productName
        productRef
        categoryName
        unitSymbol
        stockFixe
        quantityOnHand
        quantityAsked
        quantityServed
        quantityRefilled
        refills { rank quantity }
        remaining
        status
        initialStatus
        rejectReason
        rang
      }
    }
  }
`

